# backend/tests/test_routes.py
#
# Automated tests for NightWise route-comparison, OpenRouteService routing provider,
# CORS preflight, and health endpoints.
#
# Mocked provider responses are used throughout so no internet connection or
# real API key is required to run the test suite.
#
# Run from the workspace root or backend/:
#   backend/.venv/Scripts/pytest backend/tests/ -v

import sys
import os
import re
import pytest
import httpx

# Ensure backend/ is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from fastapi import HTTPException
from main import app
from scoring import compute_night_score, compute_confidence, GAP_PENALTY_PER_KM, MAX_GAP_PENALTY
from routing_provider import (
    OpenRouteServiceRoutingProvider,
    ProviderRoute,
    parse_coordinates,
    MODE_TO_ORS_PROFILE,
)
from osm_evidence_provider import (
    OpenStreetMapEvidenceProvider,
    GeographicEvidence,
    FeatureCounts,
    TagEvidenceSummary,
)
from routers.routes import get_routing_provider, get_evidence_provider

client = TestClient(app)

VALID_ORIGIN = "MG Road Metro"
VALID_DEST = "Koramangala 5th Block"
VALID_BODY = {"origin": VALID_ORIGIN, "destination": VALID_DEST, "mode": "walk"}

# ---------------------------------------------------------------------------
# Mock provider fixtures for testing
# ---------------------------------------------------------------------------

MOCK_GEOCODE_RESPONSES = {
    "MG Road Metro": (12.9756, 77.6068, "MG Road Metro, Bengaluru, India"),
    "Koramangala 5th Block": (12.9345, 77.6220, "Koramangala 5th Block, Bengaluru, India"),
    "Cubbon Park": (12.9763, 77.5929, "Cubbon Park, Bengaluru, India"),
    "Whitefield ITPL": (12.9857, 77.7368, "Whitefield ITPL, Bengaluru, India"),
}

SAMPLE_ROUTES_3 = [
    ProviderRoute(
        coords=[[12.9756, 77.6068], [12.9680, 77.6160], [12.9345, 77.6220]],
        distance_km=8.4,
        duration_min=22,
    ),
    ProviderRoute(
        coords=[[12.9756, 77.6068], [12.9700, 77.6120], [12.9600, 77.6190], [12.9345, 77.6220]],
        distance_km=9.1,
        duration_min=26,
    ),
    ProviderRoute(
        coords=[[12.9756, 77.6068], [12.9740, 77.6000], [12.9520, 77.5980], [12.9345, 77.6220]],
        distance_km=10.6,
        duration_min=31,
    ),
]


class MockRoutingProvider(OpenRouteServiceRoutingProvider):
    """Deterministic in-memory mock provider for endpoint testing."""

    def __init__(self, routes=None, fail_geocode=None, fail_route=None, api_key="mock_secret_key"):
        super().__init__(api_key=api_key)
        self.routes_to_return = routes if routes is not None else list(SAMPLE_ROUTES_3)
        self.fail_geocode = fail_geocode
        self.fail_route = fail_route

    def geocode(self, query: str) -> tuple[float, float, str]:
        if self.fail_geocode:
            raise self.fail_geocode
        clean = query.strip()
        coords = parse_coordinates(clean)
        if coords:
            return (coords[0], coords[1], clean)
        if clean in MOCK_GEOCODE_RESPONSES:
            return MOCK_GEOCODE_RESPONSES[clean]
        raise HTTPException(
            status_code=404,
            detail=f"Location not found: '{clean}'. Please check spelling or enter coordinates (lat, lng).",
        )

    def get_routes(self, start_lat, start_lng, end_lat, end_lng, mode="walk", max_detour_pct=50):
        if self.fail_route:
            raise self.fail_route
        return self.routes_to_return


class MockEvidenceProvider(OpenStreetMapEvidenceProvider):
    """Deterministic mock evidence provider returning structured OSM evidence."""

    def __init__(self, evidence=None):
        super().__init__()
        self.evidence_to_return = evidence

    def get_multi_corridor_evidence(self, routes_coords):
        return [self.get_corridor_evidence(c) for c in routes_coords]

    def get_corridor_evidence(self, coords):
        if self.evidence_to_return is not None:
            return self.evidence_to_return
        return GeographicEvidence(
            source="OpenStreetMap",
            attribution="© OpenStreetMap contributors (ODbL)",
            endpoint="https://mock.overpass.local",
            retrieved_at="2026-10-25T12:00:00Z",
            status="available",
            counts=FeatureCounts(
                transport_stops=4,
                assistance_amenities=2,
                street_lamps=5,
                lit_path_segments=3,
                surveillance_points=1,
                road_segments=6,
            ),
            observed_tags=TagEvidenceSummary(
                amenity_types={"police": 1, "hospital": 1},
                transport_types={"bus_stop": 4},
                highway_types={"primary": 3, "secondary": 3},
                lighting_tags={"street_lamp": 5, "lit_yes": 3},
                surveillance_tags={"camera": 1},
            ),
            limitations=[
                "OpenStreetMap relies on volunteer contributors. Missing map tags indicate unrecorded data in OSM, not confirmed absence in the physical world.",
                "Physical map features do NOT establish route safety.",
            ],
            missing_data_notes=[],
        )


@pytest.fixture(autouse=True)
def override_provider():
    """Default override for all tests: provide standard 3-route mock and mock evidence provider."""
    mock_routing = MockRoutingProvider()
    mock_evidence = MockEvidenceProvider()
    app.dependency_overrides[get_routing_provider] = lambda: mock_routing
    app.dependency_overrides[get_evidence_provider] = lambda: mock_evidence
    yield mock_routing
    app.dependency_overrides.pop(get_routing_provider, None)
    app.dependency_overrides.pop(get_evidence_provider, None)



# ---------------------------------------------------------------------------
# Health endpoints
# ---------------------------------------------------------------------------

class TestHealth:
    def test_root_health_200(self):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_versioned_health_200(self):
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# Provider Unit Tests (MockTransport — tests routing_provider.py directly)
# ---------------------------------------------------------------------------

class TestRoutingProviderUnit:
    """Direct tests for OpenRouteServiceRoutingProvider HTTP handling."""

    def test_missing_api_key_raises_503(self, monkeypatch):
        monkeypatch.setenv("OPENROUTESERVICE_API_KEY", "")
        provider = OpenRouteServiceRoutingProvider(api_key="")
        with pytest.raises(HTTPException) as exc_info:
            provider.geocode("MG Road Metro")
        assert exc_info.value.status_code == 503
        assert "OPENROUTESERVICE_API_KEY is missing" in exc_info.value.detail

    def test_parse_coordinates_valid_lat_lng(self):
        coords = parse_coordinates("12.9756, 77.6068")
        assert coords == (12.9756, 77.6068)

    def test_parse_coordinates_with_spaces_and_signs(self):
        coords = parse_coordinates(" +12.9756 , -77.6068 ")
        assert coords == (12.9756, -77.6068)

    def test_parse_coordinates_invalid_bounds(self):
        assert parse_coordinates("95.0, 77.6068") is None  # Lat > 90
        assert parse_coordinates("12.9756, 190.0") is None  # Lng > 180

    def test_geocode_skips_http_when_coords_supplied(self):
        provider = OpenRouteServiceRoutingProvider(api_key="any_key")
        lat, lng, label = provider.geocode("12.9756, 77.6068")
        assert lat == 12.9756
        assert lng == 77.6068

    def test_geocoding_success_geojson_order(self):
        # ORS GeoJSON coordinates are [lng, lat]
        mock_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [77.6068, 12.9756]},
                    "properties": {"label": "MG Road Metro Station, Bengaluru"},
                }
            ],
        }

        def handler(request: httpx.Request):
            assert "Authorization" in request.headers
            assert request.headers["Authorization"] == "test_key"
            assert request.url.params.get("text") == "MG Road"
            return httpx.Response(200, json=mock_geojson)

        client_mock = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenRouteServiceRoutingProvider(api_key="test_key", client=client_mock)
        lat, lng, label = provider.geocode("MG Road")
        # Ensure converted to (lat, lng)
        assert lat == 12.9756
        assert lng == 77.6068
        assert label == "MG Road Metro Station, Bengaluru"

    def test_geocoding_location_not_found_raises_404(self):
        mock_geojson = {"type": "FeatureCollection", "features": []}

        def handler(request: httpx.Request):
            return httpx.Response(200, json=mock_geojson)

        client_mock = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenRouteServiceRoutingProvider(api_key="test_key", client=client_mock)
        with pytest.raises(HTTPException) as exc_info:
            provider.geocode("Nonexistent Place 123XYZ")
        assert exc_info.value.status_code == 404
        assert "Location not found" in exc_info.value.detail

    def test_provider_mode_mapping(self):
        assert MODE_TO_ORS_PROFILE["walk"] == "foot-walking"
        assert MODE_TO_ORS_PROFILE["bike"] == "cycling-regular"
        assert MODE_TO_ORS_PROFILE["car"] == "driving-car"

    def test_directions_coordinate_order_and_metrics(self):
        # ORS Directions GeoJSON returns [lng, lat]
        mock_directions_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [77.6068, 12.9756],
                            [77.6160, 12.9680],
                            [77.6220, 12.9345],
                        ],
                    },
                    "properties": {
                        "summary": {
                            "distance": 8420.0,  # 8.42 km -> 8.4 km
                            "duration": 1320.0,  # 22 min
                        }
                    },
                }
            ],
        }

        def handler(request: httpx.Request):
            assert "foot-walking" in str(request.url)
            return httpx.Response(200, json=mock_directions_geojson)

        client_mock = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenRouteServiceRoutingProvider(api_key="test_key", client=client_mock)
        routes = provider.get_routes(12.9756, 77.6068, 12.9345, 77.6220, mode="walk")

        assert len(routes) == 1
        r = routes[0]
        assert r.distance_km == 8.4
        assert r.duration_min == 22
        # Verify coordinates converted from [lng, lat] to Leaflet [lat, lng]
        assert r.coords[0] == [12.9756, 77.6068]
        assert r.coords[1] == [12.9680, 77.6160]
        assert r.coords[2] == [12.9345, 77.6220]

    def test_directions_timeout_raises_504(self):
        def handler(request: httpx.Request):
            raise httpx.TimeoutException("Connection timed out")

        client_mock = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenRouteServiceRoutingProvider(api_key="test_key", client=client_mock)
        with pytest.raises(HTTPException) as exc_info:
            provider.get_routes(12.9756, 77.6068, 12.9345, 77.6220, mode="walk")
        assert exc_info.value.status_code == 504
        assert "timed out" in exc_info.value.detail

    def test_directions_rate_limit_429(self):
        def handler(request: httpx.Request):
            return httpx.Response(429, json={"error": "Rate limit exceeded"})

        client_mock = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenRouteServiceRoutingProvider(api_key="test_key", client=client_mock)
        with pytest.raises(HTTPException) as exc_info:
            provider.get_routes(12.9756, 77.6068, 12.9345, 77.6220, mode="walk")
        assert exc_info.value.status_code == 429
        assert "rate limit" in exc_info.value.detail.lower()

    def test_directions_no_route_404(self):
        def handler(request: httpx.Request):
            return httpx.Response(404, json={"error": "Route not found"})

        client_mock = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenRouteServiceRoutingProvider(api_key="test_key", client=client_mock)
        with pytest.raises(HTTPException) as exc_info:
            provider.get_routes(12.9756, 77.6068, 12.9345, 77.6220, mode="walk")
        assert exc_info.value.status_code == 404
        assert "No route found" in exc_info.value.detail

    def test_secret_redacted_in_exceptions(self):
        secret = "secret_super_api_key_12345"

        def handler(request: httpx.Request):
            raise httpx.ConnectError(f"Failed to connect to api_key={secret}")

        client_mock = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenRouteServiceRoutingProvider(api_key=secret, client=client_mock)
        with pytest.raises(HTTPException) as exc_info:
            provider.geocode("Test Place")
        assert secret not in str(exc_info.value.detail)
        assert "[REDACTED]" in str(exc_info.value.detail)


# ---------------------------------------------------------------------------
# Endpoint Integration Tests (POST /api/v1/routes/compare)
# ---------------------------------------------------------------------------

class TestEndpointIntegration:
    def test_returns_200_with_valid_body(self):
        r = client.post("/api/v1/routes/compare", json=VALID_BODY)
        assert r.status_code == 200

    def test_returns_routes_list_and_alternatives(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        assert "routes" in data
        assert len(data["routes"]) == 3
        assert data["fastest"] is not None
        assert data["balanced"] is not None
        assert data["safest_available_data"] is not None

    def test_alternative_ids_and_labels(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        assert data["fastest"]["id"] == "fastest"
        assert data["balanced"]["id"] == "balanced"
        assert data["safest_available_data"]["id"] == "safest_available_data"
        assert data["fastest"]["label"] == "Fastest"
        assert data["balanced"]["label"] == "Balanced"

    def test_direct_coordinate_inputs_accepted(self):
        r = client.post(
            "/api/v1/routes/compare",
            json={
                "origin": "12.9756, 77.6068",
                "destination": "12.9345, 77.6220",
                "mode": "walk",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["origin"] == "12.9756, 77.6068"
        assert data["destination"] == "12.9345, 77.6220"

    def test_no_fabricated_alternatives_when_single_route_returned(self):
        """When provider only returns 1 route, response must NOT fabricate or duplicate."""
        single_mock = MockRoutingProvider(routes=[SAMPLE_ROUTES_3[0]])
        app.dependency_overrides[get_routing_provider] = lambda: single_mock

        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        assert len(data["routes"]) == 1
        assert data["fastest"] is not None
        assert data["balanced"] is None
        assert data["safest_available_data"] is None
        assert data["routes"][0]["id"] == "fastest"

    def test_detour_cap_filters_excessive_alternatives(self):
        """With maxDetourPct=10, Route 1 (18% detour) and Route 2 (40% detour) are excluded."""
        data = client.post(
            "/api/v1/routes/compare",
            json={**VALID_BODY, "maxDetourPct": 10},
        ).json()
        # Only fastest (0% detour) satisfies maxDetourPct <= 10
        assert len(data["routes"]) == 1
        assert data["fastest"] is not None
        assert data["balanced"] is None

    def test_identical_origin_destination_422(self):
        r = client.post(
            "/api/v1/routes/compare",
            json={"origin": VALID_ORIGIN, "destination": VALID_ORIGIN, "mode": "walk"},
        )
        assert r.status_code == 422
        assert "different" in r.text.lower()

    def test_empty_origin_or_dest_422(self):
        r = client.post("/api/v1/routes/compare", json={"origin": "  ", "destination": VALID_DEST})
        assert r.status_code == 422

    def test_unsupported_mode_422(self):
        r = client.post(
            "/api/v1/routes/compare",
            json={**VALID_BODY, "mode": "rocket"},
        )
        assert r.status_code == 422

    def test_missing_api_key_returns_503(self):
        err = HTTPException(status_code=503, detail="Routing provider is not configured. OPENROUTESERVICE_API_KEY is missing.")
        mock = MockRoutingProvider(fail_geocode=err)
        app.dependency_overrides[get_routing_provider] = lambda: mock
        r = client.post("/api/v1/routes/compare", json=VALID_BODY)
        assert r.status_code == 503
        assert "OPENROUTESERVICE_API_KEY is missing" in r.json()["detail"]

    def test_unknown_location_returns_404(self):
        err = HTTPException(status_code=404, detail="Location not found: 'Nowhere City'.")
        mock = MockRoutingProvider(fail_geocode=err)
        app.dependency_overrides[get_routing_provider] = lambda: mock
        r = client.post("/api/v1/routes/compare", json={"origin": "Nowhere City", "destination": VALID_DEST})
        assert r.status_code == 404
        assert "Location not found" in r.json()["detail"]

    def test_no_route_returns_404(self):
        err = HTTPException(status_code=404, detail="No route found between the specified origin and destination.")
        mock = MockRoutingProvider(fail_route=err)
        app.dependency_overrides[get_routing_provider] = lambda: mock
        r = client.post("/api/v1/routes/compare", json=VALID_BODY)
        assert r.status_code == 404
        assert "No route found" in r.json()["detail"]

    def test_rate_limit_returns_429(self):
        err = HTTPException(status_code=429, detail="Routing provider rate limit reached.")
        mock = MockRoutingProvider(fail_route=err)
        app.dependency_overrides[get_routing_provider] = lambda: mock
        r = client.post("/api/v1/routes/compare", json=VALID_BODY)
        assert r.status_code == 429

    def test_timeout_returns_504(self):
        err = HTTPException(status_code=504, detail="Routing provider request timed out.")
        mock = MockRoutingProvider(fail_route=err)
        app.dependency_overrides[get_routing_provider] = lambda: mock
        r = client.post("/api/v1/routes/compare", json=VALID_BODY)
        assert r.status_code == 504

    def test_upstream_error_returns_502(self):
        err = HTTPException(status_code=502, detail="Routing provider upstream error.")
        mock = MockRoutingProvider(fail_route=err)
        app.dependency_overrides[get_routing_provider] = lambda: mock
        r = client.post("/api/v1/routes/compare", json=VALID_BODY)
        assert r.status_code == 502

    def test_disclaimer_present_in_response_and_routes(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        assert "disclaimer" in data
        assert "OpenRouteService" in data["disclaimer"]
        assert "disclaimer" in data["routes"][0]

    def test_demo_safety_context_attached_to_all_alternatives(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        assert len(data["routes"]) > 0
        for alt in data["routes"]:
            assert "demo_context" in alt
            dc = alt["demo_context"]
            assert dc is not None
            assert dc["source"] == "SYNTHETIC DEMO DATA — NOT VERIFIED"
            assert dc["status"] == "simulated_demo"
            assert "DEMO DATA — NOT VERIFIED" in dc["disclaimer"]

            counts = dc["counts"]
            assert "public_transport" in counts
            assert "assistance_points" in counts
            assert "lighting" in counts
            assert "cctv" in counts
            assert "community_safety_reports" in counts
            assert counts["total"] == (
                counts["public_transport"]
                + counts["assistance_points"]
                + counts["lighting"]
                + counts["cctv"]
                + counts["community_safety_reports"]
            )

    def test_corridor_filtering_matches_points_along_bengaluru_route(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        fastest_dc = data["fastest"]["demo_context"]
        assert fastest_dc["is_corridor_filtered"] is True
        assert "< 600m" in fastest_dc["filter_description"]
        assert len(fastest_dc["matched_record_ids"]) > 0

    def test_corridor_filtering_fallback_when_route_outside_demo_corridor(self):
        far_route = [
            ProviderRoute(
                coords=[[28.6139, 77.2090], [28.7041, 77.1025]],  # Delhi coords, far from Bengaluru
                distance_km=15.0,
                duration_min=45,
            )
        ]
        mock = MockRoutingProvider(routes=far_route)
        app.dependency_overrides[get_routing_provider] = lambda: mock
        try:
            data = client.post(
                "/api/v1/routes/compare",
                json={"origin": "28.6139, 77.2090", "destination": "28.7041, 77.1025", "mode": "walk"},
            ).json()
            dc = data["routes"][0]["demo_context"]
            assert dc["is_corridor_filtered"] is False
            assert "totals" in dc["filter_description"].lower()
            assert dc["counts"]["total"] >= 15
        finally:
            app.dependency_overrides.pop(get_routing_provider, None)

    def test_notes_when_osm_evidence_unavailable(self):
        unavailable_evidence = GeographicEvidence(status="unavailable", counts=FeatureCounts())
        mock_ev = MockEvidenceProvider(evidence=unavailable_evidence)
        app.dependency_overrides[get_evidence_provider] = lambda: mock_ev
        try:
            data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
            fastest = data["fastest"]
            notes_str = " ".join(fastest["notes"])
            assert "unavailable" in notes_str.lower()
            assert "synthetic demo context" in notes_str.lower()
            assert "transit stops" in notes_str.lower()
            assert "cctv" in notes_str.lower()
        finally:
            app.dependency_overrides.pop(get_evidence_provider, None)


# ---------------------------------------------------------------------------
# Scoring unit tests (preserves existing scoring formulas untouched)
# ---------------------------------------------------------------------------

class TestScoring:
    def test_all_known_signals_no_gap(self):
        signals = {
            "lighting": 80,
            "activity": 70,
            "main_road": 60,
            "transport_help": 90,
            "cctv": 50,
        }
        score, breakdown, penalty = compute_night_score(signals, gap_km=0.0)
        assert 0 <= score <= 100
        assert penalty == 0.0
        assert all(v["known"] for v in breakdown.values())

    def test_unknown_signals_reduce_confidence(self):
        signals_partial = {
            "lighting": 80,
            "activity": None,
            "main_road": 60,
            "transport_help": None,
            "cctv": None,
        }
        confidence = compute_confidence(signals_partial, data_coverage_pct=61)
        assert confidence in ("low", "medium")

    def test_all_known_high_coverage_gives_high_confidence(self):
        signals_full = {
            "lighting": 80,
            "activity": 70,
            "main_road": 60,
            "transport_help": 90,
            "cctv": 50,
        }
        confidence = compute_confidence(signals_full, data_coverage_pct=94)
        assert confidence == "high"

    def test_gap_penalty_applied(self):
        signals = {
            "lighting": 80,
            "activity": 80,
            "main_road": 80,
            "transport_help": 80,
            "cctv": 80,
        }
        score_no_gap, _, penalty_no_gap = compute_night_score(signals, gap_km=0.0)
        score_with_gap, _, penalty_with_gap = compute_night_score(signals, gap_km=2.0)
        assert penalty_no_gap == 0.0
        assert penalty_with_gap == pytest.approx(2.0 * GAP_PENALTY_PER_KM)
        assert score_with_gap < score_no_gap

    def test_gap_penalty_capped(self):
        signals = {"lighting": 80, "activity": 80, "main_road": 80, "transport_help": 80, "cctv": 80}
        _, _, penalty = compute_night_score(signals, gap_km=100.0)
        assert penalty == pytest.approx(MAX_GAP_PENALTY)


# ---------------------------------------------------------------------------
# CORS preflight tests (preserves CORS fixes)
# ---------------------------------------------------------------------------

class TestCors:
    PREFLIGHT_HEADERS = {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }

    def _preflight(self, origin: str):
        return client.options(
            "/api/v1/routes/compare",
            headers={"Origin": origin, **self.PREFLIGHT_HEADERS},
        )

    def test_preflight_localhost_8080_status(self):
        r = self._preflight("http://localhost:8080")
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "http://localhost:8080"

    def test_preflight_localhost_8081_status(self):
        r = self._preflight("http://localhost:8081")
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "http://localhost:8081"

    def test_preflight_localhost_5173_status(self):
        r = self._preflight("http://localhost:5173")
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_preflight_localhost_3000_status(self):
        r = self._preflight("http://localhost:3000")
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"

    def test_preflight_dynamic_port_status(self):
        r = self._preflight("http://localhost:54321")
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "http://localhost:54321"

    def test_preflight_unknown_origin_returns_400(self):
        r = self._preflight("http://evil.example.com")
        assert r.status_code == 400
        assert "Disallowed CORS origin" in r.text

    def test_preflight_allows_authorization_header(self):
        r = client.options(
            "/api/v1/routes/compare",
            headers={
                "Origin": "http://localhost:8080",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization, content-type",
            },
        )
        assert r.status_code == 200
        acah = r.headers.get("access-control-allow-headers", "").lower()
        assert "authorization" in acah

    def test_actual_post_includes_cors_header(self):
        r = client.post(
            "/api/v1/routes/compare",
            json=VALID_BODY,
            headers={"Origin": "http://localhost:8080"},
        )
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "http://localhost:8080"
