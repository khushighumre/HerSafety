"""
backend/tests/test_osm_evidence.py

Automated tests for OpenStreetMapEvidenceProvider and evidence attachment in route comparison.
All external Overpass HTTP requests are mocked so tests never depend on a live network.

Covers:
- Successful OSM/Overpass responses with parsed features and tag breakdowns
- Empty feature results
- Missing lighting / CCTV tags and explicit missing data notes
- Provider timeout handling (bounded, explicit unavailable, retrieved_at=None)
- Provider HTTP error (429, 500, 502) and malformed JSON response handling
- In-memory CorridorCache hit and TTL expiry
- Route geometry corridor proximity filtering (features on-corridor vs far corners)
- Max bounding box span protection
- Integration with route comparison endpoint ensuring no fake safety scores or fake timestamps
"""

import time
import pytest
import httpx
from fastapi.testclient import TestClient

from main import app
from osm_evidence_provider import (
    OpenStreetMapEvidenceProvider,
    CorridorCache,
    GeographicEvidence,
    FeatureCounts,
    TagEvidenceSummary,
    build_overpass_query,
    is_point_near_polyline,
)
from routers.routes import get_routing_provider, get_evidence_provider
from routing_provider import ProviderRoute

client = TestClient(app)

# Sample route coordinates along MG Road corridor in Bengaluru
MG_ROAD_COORDS = [
    [12.9756, 77.6068],
    [12.9740, 77.6090],
    [12.9725, 77.6120],
    [12.9710, 77.6150],
]

SAMPLE_OSM_ELEMENTS = [
    # Police station near route
    {
        "type": "node",
        "id": 101,
        "lat": 12.9742,
        "lon": 77.6092,
        "tags": {"amenity": "police", "name": "Cubbon Park Police"},
    },
    # Bus stop near route
    {
        "type": "node",
        "id": 102,
        "lat": 12.9727,
        "lon": 77.6122,
        "tags": {"highway": "bus_stop", "name": "Brigade Rd Junction"},
    },
    # Subway entrance near route
    {
        "type": "node",
        "id": 103,
        "lat": 12.9755,
        "lon": 77.6070,
        "tags": {"railway": "subway_entrance", "name": "MG Road Station Exit A"},
    },
    # Street lamp near route
    {
        "type": "node",
        "id": 104,
        "lat": 12.9739,
        "lon": 77.6095,
        "tags": {"highway": "street_lamp"},
    },
    # Way with explicit lighting tag near route
    {
        "type": "way",
        "id": 201,
        "center": {"lat": 12.9730, "lon": 77.6110},
        "tags": {"highway": "primary", "lit": "yes", "name": "Mahatma Gandhi Road"},
    },
    # Surveillance camera near route
    {
        "type": "node",
        "id": 105,
        "lat": 12.9726,
        "lon": 77.6121,
        "tags": {"man_made": "surveillance", "surveillance:type": "camera"},
    },
    # Feature FAR away (outside corridor > 1km) — should be filtered out
    {
        "type": "node",
        "id": 999,
        "lat": 12.9950,
        "lon": 77.6350,
        "tags": {"amenity": "police", "name": "Distant Police Station"},
    },
]


# ---------------------------------------------------------------------------
# Unit tests for OpenStreetMapEvidenceProvider
# ---------------------------------------------------------------------------

class TestOsmEvidenceProviderUnit:
    """Tests for OSM Overpass querying, parsing, caching, and error resilience."""

    @pytest.fixture(autouse=True)
    def reset_cooldown_fixture(self):
        OpenStreetMapEvidenceProvider.reset_cooldown()
        yield
        OpenStreetMapEvidenceProvider.reset_cooldown()

    def test_successful_osm_response(self):
        """Verify successful response aggregates counts and tag breakdowns correctly."""
        def handler(request: httpx.Request) -> httpx.Response:
            assert b"out" in request.content
            return httpx.Response(
                status_code=200,
                json={"elements": SAMPLE_OSM_ELEMENTS},
            )


        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenStreetMapEvidenceProvider(
            endpoint="https://mock.overpass.local/api/interpreter",
            timeout_sec=5.0,
            cache=CorridorCache(),
            client=mock_client,
        )

        evidence = provider.get_corridor_evidence(MG_ROAD_COORDS)

        assert evidence.status == "available"
        assert evidence.source == "OpenStreetMap"
        assert "ODbL" in evidence.attribution
        assert evidence.retrieved_at is not None

        # Verify on-corridor counts
        assert evidence.counts.assistance_amenities == 1  # 1 police (distant one excluded)
        assert evidence.counts.transport_stops == 2        # 1 bus stop + 1 subway entrance
        assert evidence.counts.street_lamps == 1           # 1 street_lamp
        assert evidence.counts.lit_path_segments == 1      # 1 way with lit=yes
        assert evidence.counts.surveillance_points == 1    # 1 camera
        assert evidence.counts.road_segments == 1          # 1 primary highway

        # Verify observed tags breakdown
        assert evidence.observed_tags.amenity_types.get("police") == 1
        assert evidence.observed_tags.transport_types.get("bus_stop") == 1
        assert evidence.observed_tags.transport_types.get("subway_entrance") == 1
        assert evidence.observed_tags.lighting_tags.get("street_lamp") == 1
        assert evidence.observed_tags.lighting_tags.get("lit_yes") == 1

        # Limitations should clearly state data caveats
        assert any("volunteer" in lim.lower() for lim in evidence.limitations)
        assert any("not establish route safety" in lim.lower() for lim in evidence.limitations)

    def test_empty_osm_response(self):
        """Verify empty OSM response returns available status with 0 counts and missing data notes."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=200, json={"elements": []})

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenStreetMapEvidenceProvider(
            endpoint="https://mock.overpass.local",
            cache=CorridorCache(),
            client=mock_client,
        )

        evidence = provider.get_corridor_evidence(MG_ROAD_COORDS)

        assert evidence.status == "available"
        assert evidence.retrieved_at is not None
        assert evidence.counts.transport_stops == 0
        assert evidence.counts.assistance_amenities == 0
        assert evidence.counts.street_lamps == 0
        assert evidence.counts.surveillance_points == 0

        # Must have explicit missing data notes
        notes_str = " ".join(evidence.missing_data_notes)
        assert "Lighting" in notes_str
        assert "Surveillance" in notes_str
        assert "Assistance" in notes_str

    def test_missing_lighting_and_cctv_tags(self):
        """Verify that when roads and transit exist but no lighting/CCTV is mapped, missing notes appear."""
        elements = [
            {
                "type": "node",
                "id": 1,
                "lat": 12.9740,
                "lon": 77.6090,
                "tags": {"highway": "bus_stop"},
            },
            {
                "type": "way",
                "id": 2,
                "center": {"lat": 12.9740, "lon": 77.6090},
                "tags": {"highway": "residential"},  # No lit=* tag
            },
        ]
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=200, json={"elements": elements})

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenStreetMapEvidenceProvider(
            endpoint="https://mock.overpass.local",
            cache=CorridorCache(),
            client=mock_client,
        )

        evidence = provider.get_corridor_evidence(MG_ROAD_COORDS)
        assert evidence.counts.transport_stops == 1
        assert evidence.counts.road_segments == 1
        assert evidence.counts.street_lamps == 0
        assert evidence.counts.surveillance_points == 0

        assert any("Lighting: No streetlamps" in n for n in evidence.missing_data_notes)
        assert any("Surveillance: No CCTV" in n for n in evidence.missing_data_notes)

    def test_provider_timeout_handling(self):
        """Verify timeout returns status='unavailable', retrieved_at=None, without crashing."""
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.TimeoutException("Connection timed out")

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenStreetMapEvidenceProvider(
            endpoint="https://mock.overpass.local",
            timeout_sec=3.0,
            cache=CorridorCache(),
            client=mock_client,
        )

        evidence = provider.get_corridor_evidence(MG_ROAD_COORDS)

        assert evidence.status == "unavailable"
        assert evidence.retrieved_at is None
        assert evidence.counts.assistance_amenities == 0
        assert any("timed out" in lim.lower() for lim in evidence.limitations)
        assert any("timed out" in n.lower() for n in evidence.missing_data_notes)

    def test_provider_http_error_handling(self):
        """Verify HTTP 502/500/429 upstream errors return explicit error/unavailable status."""
        for code in (429, 502, 500):
            def handler(request: httpx.Request) -> httpx.Response:
                return httpx.Response(status_code=code, text="Service Unavailable")

            mock_client = httpx.Client(transport=httpx.MockTransport(handler))
            provider = OpenStreetMapEvidenceProvider(
                endpoint="https://mock.overpass.local",
                cache=CorridorCache(),
                client=mock_client,
            )

            evidence = provider.get_corridor_evidence(MG_ROAD_COORDS)
            assert evidence.status in ("unavailable", "error")
            assert evidence.retrieved_at is None
            assert evidence.counts.assistance_amenities == 0

    def test_malformed_json_handling(self):
        """Verify non-JSON response returns error status and no crash."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=200, text="<html>Gateway Error</html>")

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenStreetMapEvidenceProvider(
            endpoint="https://mock.overpass.local",
            cache=CorridorCache(),
            client=mock_client,
        )

        evidence = provider.get_corridor_evidence(MG_ROAD_COORDS)
        assert evidence.status == "error"
        assert evidence.retrieved_at is None
        assert any("malformed" in lim.lower() for lim in evidence.limitations)

    def test_cache_hit_and_expiry(self):
        """Verify in-memory CorridorCache avoids redundant HTTP calls and expires after TTL."""
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(status_code=200, json={"elements": SAMPLE_OSM_ELEMENTS})

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        cache = CorridorCache(ttl_seconds=0.2, max_size=10)
        provider = OpenStreetMapEvidenceProvider(
            endpoint="https://mock.overpass.local",
            cache=cache,
            client=mock_client,
        )

        # First call: hits HTTP
        ev1 = provider.get_corridor_evidence(MG_ROAD_COORDS)
        assert call_count == 1
        assert ev1.status == "available"

        # Second call immediately: cache hit, no HTTP call
        ev2 = provider.get_corridor_evidence(MG_ROAD_COORDS)
        assert call_count == 1
        assert ev2.status == "available"

        # Wait for TTL expiry
        time.sleep(0.25)

        # Third call: cache expired, hits HTTP again
        ev3 = provider.get_corridor_evidence(MG_ROAD_COORDS)
        assert call_count == 2
        assert ev3.status == "available"

    def test_large_bounding_box_span_protection(self, monkeypatch):
        """Verify large bounding box (e.g. inter-city route) returns partial status without hitting endpoint."""
        monkeypatch.setenv("OVERPASS_MAX_BBOX_SPAN", "0.1")
        far_coords = [
            [12.9756, 77.6068],
            [13.5000, 78.2000],  # ~80 km away
        ]

        provider = OpenStreetMapEvidenceProvider(cache=CorridorCache())
        evidence = provider.get_corridor_evidence(far_coords)

        assert evidence.status == "partial"
        assert evidence.retrieved_at is None
        assert any("exceeds maximum" in lim.lower() for lim in evidence.limitations)

    def test_insufficient_coords_handling(self):
        """Verify empty or single-point coords returns unavailable status cleanly."""
        provider = OpenStreetMapEvidenceProvider()
        ev_empty = provider.get_corridor_evidence([])
        assert ev_empty.status == "unavailable"

        ev_single = provider.get_corridor_evidence([[12.97, 77.60]])
        assert ev_single.status == "unavailable"

    def test_multi_corridor_single_query_reuse(self):
        """Verify multiple route alternatives sharing a trip make only 1 upstream Overpass call."""
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(status_code=200, json={"elements": SAMPLE_OSM_ELEMENTS})

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenStreetMapEvidenceProvider(
            endpoint="https://mock.overpass.local",
            cache=CorridorCache(),
            client=mock_client,
        )

        alt_coords_1 = MG_ROAD_COORDS
        alt_coords_2 = [
            [12.9756, 77.6068],
            [12.9735, 77.6105],
            [12.9710, 77.6150],
        ]

        results = provider.get_multi_corridor_evidence([alt_coords_1, alt_coords_2])

        assert len(results) == 2
        assert call_count == 1  # Exactly 1 HTTP query for both routes!
        assert results[0].status == "available"
        assert results[1].status == "available"
        # Features independently evaluated for each
        assert results[0].counts.assistance_amenities >= 1
        assert results[1].counts.assistance_amenities >= 1

    def test_fallback_endpoint_switching(self):
        """Verify provider switches to fallback endpoint when primary endpoint times out."""
        queried_endpoints = []

        def handler(request: httpx.Request) -> httpx.Response:
            url_str = str(request.url)
            queried_endpoints.append(url_str)
            if "primary.overpass.local" in url_str:
                raise httpx.TimeoutException("Primary timed out")
            return httpx.Response(status_code=200, json={"elements": SAMPLE_OSM_ELEMENTS})

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenStreetMapEvidenceProvider(
            endpoint="https://primary.overpass.local/api/interpreter",
            fallback_endpoint="https://fallback.overpass.local/api/interpreter",
            cache=CorridorCache(),
            client=mock_client,
        )

        evidence = provider.get_corridor_evidence(MG_ROAD_COORDS)

        assert evidence.status == "available"
        assert "fallback.overpass.local" in evidence.endpoint
        assert len(queried_endpoints) == 2
        assert "primary.overpass.local" in queried_endpoints[0]
        assert "fallback.overpass.local" in queried_endpoints[1]

    def test_failure_cooldown_prevents_retry_storms(self):
        """Verify that when both endpoints fail, failure cooldown blocks immediate repeated requests."""
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            raise httpx.TimeoutException("All endpoints down")

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenStreetMapEvidenceProvider(
            endpoint="https://primary.overpass.local/api/interpreter",
            fallback_endpoint="https://fallback.overpass.local/api/interpreter",
            cooldown_sec=60.0,
            cache=CorridorCache(),
            client=mock_client,
        )

        # First attempt: tries primary and fallback (2 calls)
        ev1 = provider.get_corridor_evidence(MG_ROAD_COORDS)
        assert ev1.status == "unavailable"
        assert call_count == 2

        # Second attempt immediately: cooldown is active, NO new HTTP calls should be made!
        ev2 = provider.get_corridor_evidence(MG_ROAD_COORDS)
        assert ev2.status == "unavailable"
        assert call_count == 2  # Still 2, no extra call!
        assert any("cooling down" in lim.lower() for lim in ev2.limitations)
        assert any("paused" in note.lower() for note in ev2.missing_data_notes)

    def test_safe_diagnostic_logging_no_secrets(self, caplog):
        """Verify diagnostic logs include hostname, duration, status and never log secret tokens or bodies."""
        import logging

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=200, json={"elements": []})

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = OpenStreetMapEvidenceProvider(
            endpoint="https://safe-host.overpass.local/api/interpreter?secret_token=DO_NOT_LOG",
            cache=CorridorCache(),
            client=mock_client,
        )

        with caplog.at_level(logging.INFO, logger="nightwise.osm_evidence"):
            provider.get_corridor_evidence(MG_ROAD_COORDS)

        log_text = caplog.text
        assert "safe-host.overpass.local" in log_text
        assert "DO_NOT_LOG" not in log_text


# ---------------------------------------------------------------------------
# Integration tests with POST /api/v1/routes/compare
# ---------------------------------------------------------------------------

class TestEndpointEvidenceIntegration:
    """Verifies evidence is attached to routes in POST /api/v1/routes/compare."""

    @pytest.fixture(autouse=True)
    def setup_mocks(self):
        from routing_provider import OpenRouteServiceRoutingProvider
        from tests.test_routes import MockRoutingProvider, MockEvidenceProvider
        mock_routing = MockRoutingProvider()
        mock_evidence = MockEvidenceProvider()
        app.dependency_overrides[get_routing_provider] = lambda: mock_routing
        app.dependency_overrides[get_evidence_provider] = lambda: mock_evidence
        yield
        app.dependency_overrides.pop(get_routing_provider, None)
        app.dependency_overrides.pop(get_evidence_provider, None)

    def test_compare_routes_includes_real_osm_evidence(self):
        """Successful comparison returns evidence object for each alternative."""

        r = client.post("/api/v1/routes/compare", json={
            "origin": "MG Road Metro",
            "destination": "Koramangala 5th Block",
            "mode": "walk",
        })
        assert r.status_code == 200
        data = r.json()

        routes = data["routes"]
        assert len(routes) >= 1
        for rt in routes:
            assert "evidence" in rt
            ev = rt["evidence"]
            assert ev is not None
            assert ev["source"] == "OpenStreetMap"
            assert "ODbL" in ev["attribution"]
            assert ev["status"] == "available"
            assert isinstance(ev["counts"], dict)
            assert "transport_stops" in ev["counts"]
            assert "street_lamps" in ev["counts"]
            assert "surveillance_points" in ev["counts"]
            assert "assistance_amenities" in ev["counts"]

    def test_provider_failure_does_not_break_routing_or_fabricate_scores(self):
        """When evidence provider fails, routes still return with live metrics and explicit unavailable status."""
        class FailingEvidenceProvider(OpenStreetMapEvidenceProvider):
            def get_corridor_evidence(self, coords):
                return GeographicEvidence(
                    source="OpenStreetMap",
                    attribution="© OpenStreetMap contributors (ODbL)",
                    status="unavailable",
                    retrieved_at=None,
                    counts=FeatureCounts(),
                    observed_tags=TagEvidenceSummary(),
                    limitations=["Provider unreachable: connection timeout."],
                    missing_data_notes=["No evidence retrieved due to upstream timeout."],
                )

            def get_multi_corridor_evidence(self, routes_coords):
                return [self.get_corridor_evidence(c) for c in routes_coords]

        app.dependency_overrides[get_evidence_provider] = lambda: FailingEvidenceProvider()
        try:
            r = client.post("/api/v1/routes/compare", json={
                "origin": "MG Road Metro",
                "destination": "Koramangala 5th Block",
                "mode": "walk",
            })
            assert r.status_code == 200
            data = r.json()
            for rt in data["routes"]:
                # Routing geometry and live metrics must be intact
                assert len(rt["coords"]) > 0
                assert rt["distanceKm"] > 0
                assert rt["durationMin"] > 0

                # Evidence reflects provider failure explicitly
                ev = rt["evidence"]
                assert ev["status"] == "unavailable"
                assert ev["retrieved_at"] is None  # NO fake timestamp
                assert ev["counts"]["assistance_amenities"] == 0
                assert ev["counts"]["street_lamps"] == 0
                assert any("unreachable" in lim.lower() for lim in ev["limitations"])
        finally:
            app.dependency_overrides.pop(get_evidence_provider, None)

    def test_route_alternatives_query_shared_corridor(self):
        """Verify that comparing 3 routes queries the shared corridor in one batch."""
        multi_calls = []

        class TrackingEvidenceProvider(OpenStreetMapEvidenceProvider):
            def get_multi_corridor_evidence(self, routes_coords):
                multi_calls.append(len(routes_coords))
                return [
                    GeographicEvidence(
                        source="OpenStreetMap",
                        attribution="© OpenStreetMap contributors (ODbL)",
                        status="available",
                        retrieved_at="2026-10-25T12:00:00Z",
                        counts=FeatureCounts(assistance_amenities=1),
                    )
                    for _ in routes_coords
                ]

        app.dependency_overrides[get_evidence_provider] = lambda: TrackingEvidenceProvider()
        try:
            r = client.post("/api/v1/routes/compare", json={
                "origin": "MG Road Metro",
                "destination": "Koramangala 5th Block",
                "mode": "walk",
            })
            assert r.status_code == 200
            data = r.json()
            assert len(data["routes"]) == 3
            # Exactly 1 call to get_multi_corridor_evidence for all 3 routes!
            assert len(multi_calls) == 1
            assert multi_calls[0] == 3
            for rt in data["routes"]:
                assert rt["evidence"]["status"] == "available"
        finally:
            app.dependency_overrides.pop(get_evidence_provider, None)

