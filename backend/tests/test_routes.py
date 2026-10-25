# backend/tests/test_routes.py
#
# Tests for POST /api/v1/routes/compare and GET /health endpoints.
#
# Run from the backend/ directory:
#   .venv/Scripts/pytest tests/ -v

import sys
import os
import pytest

# Ensure backend/ is on sys.path when pytest is invoked from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app
from scoring import compute_night_score, compute_confidence, GAP_PENALTY_PER_KM, MAX_GAP_PENALTY

client = TestClient(app)

VALID_ORIGIN = "MG Road Metro"
VALID_DEST   = "Koramangala 5th Block"
VALID_BODY   = {"origin": VALID_ORIGIN, "destination": VALID_DEST, "mode": "walk"}


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
# Valid comparison — response shape
# ---------------------------------------------------------------------------

class TestValidComparison:
    def test_returns_200(self):
        r = client.post("/api/v1/routes/compare", json=VALID_BODY)
        assert r.status_code == 200

    def test_returns_exactly_three_alternatives(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        assert "fastest" in data
        assert "balanced" in data
        assert "safest_available_data" in data

    def test_alternative_ids(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        assert data["fastest"]["id"] == "fastest"
        assert data["balanced"]["id"] == "balanced"
        assert data["safest_available_data"]["id"] == "safest_available_data"

    def test_required_fields_present(self):
        alt = client.post("/api/v1/routes/compare", json=VALID_BODY).json()["fastest"]
        for field in [
            "id", "label", "distanceKm", "durationMin", "mode",
            "nightScore", "breakdown", "confidence", "dataCoveragePct",
            "freshnessHours", "detourPct", "maxDetourPct",
            "gap", "notes", "coords", "disclaimer",
        ]:
            assert field in alt, f"Missing field: {field}"

    def test_night_score_in_range(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        for key in ("fastest", "balanced", "safest_available_data"):
            score = data[key]["nightScore"]
            assert 0 <= score <= 100, f"{key} nightScore={score} out of range"

    def test_confidence_valid_values(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        for key in ("fastest", "balanced", "safest_available_data"):
            assert data[key]["confidence"] in ("low", "medium", "high")

    def test_mode_echoed_in_each_alternative(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        for key in ("fastest", "balanced", "safest_available_data"):
            assert data[key]["mode"] == "walk"

    def test_disclaimer_present_in_response_root(self):
        assert "disclaimer" in client.post("/api/v1/routes/compare", json=VALID_BODY).json()

    def test_disclaimer_present_in_each_alternative(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        for key in ("fastest", "balanced", "safest_available_data"):
            assert len(data[key]["disclaimer"]) > 10

    def test_fastest_has_zero_detour(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        assert data["fastest"]["detourPct"] == 0.0

    def test_safest_has_highest_or_equal_night_score(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        safest = data["safest_available_data"]["nightScore"]
        assert safest >= data["fastest"]["nightScore"]
        assert safest >= data["balanced"]["nightScore"]

    def test_fastest_has_lowest_or_equal_duration(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        fastest_dur = data["fastest"]["durationMin"]
        assert fastest_dur <= data["balanced"]["durationMin"]
        assert fastest_dur <= data["safest_available_data"]["durationMin"]


# ---------------------------------------------------------------------------
# Coordinate geometry
# ---------------------------------------------------------------------------

class TestGeometry:
    def test_coords_are_lat_lng_pairs(self):
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        for key in ("fastest", "balanced", "safest_available_data"):
            coords = data[key]["coords"]
            assert len(coords) >= 2, f"{key} has fewer than 2 coords"
            for pt in coords:
                assert len(pt) == 2, f"{key} coord {pt} is not a [lat, lng] pair"

    def test_coords_within_bengaluru_bounds(self):
        from fixtures import LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX
        data = client.post("/api/v1/routes/compare", json=VALID_BODY).json()
        for key in ("fastest", "balanced", "safest_available_data"):
            for pt in data[key]["coords"]:
                lat, lng = pt
                assert LAT_MIN <= lat <= LAT_MAX, f"{key} lat={lat} out of bounds"
                assert LNG_MIN <= lng <= LNG_MAX, f"{key} lng={lng} out of bounds"


# ---------------------------------------------------------------------------
# Input validation errors
# ---------------------------------------------------------------------------

class TestValidationErrors:
    def test_unknown_origin_422(self):
        r = client.post("/api/v1/routes/compare", json={
            "origin": "Nowhere City", "destination": VALID_DEST, "mode": "walk"
        })
        assert r.status_code == 422

    def test_unknown_destination_422(self):
        r = client.post("/api/v1/routes/compare", json={
            "origin": VALID_ORIGIN, "destination": "Nowhere City", "mode": "walk"
        })
        assert r.status_code == 422

    def test_identical_origin_destination_422(self):
        r = client.post("/api/v1/routes/compare", json={
            "origin": VALID_ORIGIN, "destination": VALID_ORIGIN, "mode": "walk"
        })
        assert r.status_code == 422

    def test_unsupported_mode_422(self):
        r = client.post("/api/v1/routes/compare", json={
            "origin": VALID_ORIGIN, "destination": VALID_DEST, "mode": "hoverboard"
        })
        assert r.status_code == 422

    def test_detour_below_zero_422(self):
        r = client.post("/api/v1/routes/compare", json={**VALID_BODY, "maxDetourPct": -1})
        assert r.status_code == 422

    def test_detour_above_200_422(self):
        r = client.post("/api/v1/routes/compare", json={**VALID_BODY, "maxDetourPct": 201})
        assert r.status_code == 422

    def test_no_fixture_for_pair_404(self):
        # Both locations exist but no fixture path connects them
        r = client.post("/api/v1/routes/compare", json={
            "origin": "Cubbon Park", "destination": "Whitefield ITPL", "mode": "walk"
        })
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Detour cap enforcement
# ---------------------------------------------------------------------------

class TestDetourCap:
    def test_zero_detour_cap_all_return_fastest_path(self):
        """With maxDetourPct=0, only the fastest path is eligible; all three
        alternatives must therefore have detourPct == 0."""
        data = client.post("/api/v1/routes/compare", json={**VALID_BODY, "maxDetourPct": 0}).json()
        assert data["fastest"]["detourPct"] == 0.0
        assert data["balanced"]["detourPct"] == 0.0
        assert data["safest_available_data"]["detourPct"] == 0.0

    def test_large_cap_allows_all_candidates(self):
        data = client.post("/api/v1/routes/compare", json={**VALID_BODY, "maxDetourPct": 200}).json()
        assert data["safest_available_data"]["nightScore"] >= data["fastest"]["nightScore"]

    def test_detour_cap_echoed_in_response(self):
        data = client.post("/api/v1/routes/compare", json={**VALID_BODY, "maxDetourPct": 15}).json()
        assert data["maxDetourPct"] == 15
        for key in ("fastest", "balanced", "safest_available_data"):
            assert data[key]["maxDetourPct"] == 15

    def test_eligible_routes_respect_cap(self):
        cap = 10
        data = client.post("/api/v1/routes/compare", json={**VALID_BODY, "maxDetourPct": cap}).json()
        for key in ("fastest", "balanced", "safest_available_data"):
            assert data[key]["detourPct"] <= cap, (
                f"{key} detourPct={data[key]['detourPct']} exceeds cap={cap}"
            )


# ---------------------------------------------------------------------------
# Scoring unit tests
# ---------------------------------------------------------------------------

class TestScoring:
    def test_all_known_signals_no_gap(self):
        signals = {
            "lighting": 80, "activity": 70, "main_road": 60,
            "transport_help": 90, "cctv": 50,
        }
        score, breakdown, penalty = compute_night_score(signals, gap_km=0.0)
        assert 0 <= score <= 100
        assert penalty == 0.0
        assert all(v["known"] for v in breakdown.values())

    def test_unknown_signals_reduce_confidence(self):
        signals_partial = {
            "lighting": 80, "activity": None, "main_road": 60,
            "transport_help": None, "cctv": None,
        }
        # 2/5 known, 61% coverage → combined = 0.6*(2/5) + 0.4*0.61 = 0.484 → medium
        confidence = compute_confidence(signals_partial, data_coverage_pct=61)
        assert confidence in ("low", "medium")

    def test_all_known_high_coverage_gives_high_confidence(self):
        signals_full = {
            "lighting": 80, "activity": 70, "main_road": 60,
            "transport_help": 90, "cctv": 50,
        }
        confidence = compute_confidence(signals_full, data_coverage_pct=94)
        assert confidence == "high"

    def test_gap_penalty_applied(self):
        signals = {
            "lighting": 80, "activity": 80, "main_road": 80,
            "transport_help": 80, "cctv": 80,
        }
        score_no_gap, _, penalty_no_gap = compute_night_score(signals, gap_km=0.0)
        score_with_gap, _, penalty_with_gap = compute_night_score(signals, gap_km=2.0)
        assert penalty_no_gap == 0.0
        assert penalty_with_gap == pytest.approx(2.0 * GAP_PENALTY_PER_KM)
        assert score_with_gap < score_no_gap

    def test_gap_penalty_capped(self):
        signals = {"lighting": 80, "activity": 80, "main_road": 80,
                   "transport_help": 80, "cctv": 80}
        _, _, penalty = compute_night_score(signals, gap_km=100.0)
        assert penalty == pytest.approx(MAX_GAP_PENALTY)

    def test_all_unknown_signals_score_zero(self):
        signals = {
            "lighting": None, "activity": None, "main_road": None,
            "transport_help": None, "cctv": None,
        }
        score, _, _ = compute_night_score(signals, gap_km=0.0)
        assert score == 0

    def test_score_clamped_to_0_100(self):
        signals = {"lighting": 100, "activity": 100, "main_road": 100,
                   "transport_help": 100, "cctv": 100}
        score, _, _ = compute_night_score(signals, gap_km=0.0)
        assert 0 <= score <= 100

    def test_deterministic_unit(self):
        signals = {
            "lighting": 52, "activity": 38, "main_road": 70,
            "transport_help": 60, "cctv": None,
        }
        results = [compute_night_score(signals, gap_km=1.2)[0] for _ in range(5)]
        assert len(set(results)) == 1, f"Non-deterministic scores: {results}"

    def test_deterministic_api(self):
        scores = [
            client.post("/api/v1/routes/compare", json=VALID_BODY).json()["fastest"]["nightScore"]
            for _ in range(3)
        ]
        assert len(set(scores)) == 1, f"Non-deterministic API scores: {scores}"

    def test_breakdown_contains_all_signals(self):
        breakdown = client.post("/api/v1/routes/compare", json=VALID_BODY).json()["fastest"]["breakdown"]
        for signal in ("lighting", "activity", "main_road", "transport_help", "cctv"):
            assert signal in breakdown

    def test_unknown_signal_marked_not_known(self):
        # The fixture with activity=None and cctv=None is mgroad_koramangala_safest.
        # With default maxDetourPct=50 the balanced path (score 71) wins the
        # safest_available_data slot, so we test the direct fixture instead.
        from scoring import compute_night_score
        from fixtures import ROUTE_PATHS
        safest_fixture = ROUTE_PATHS["mgroad_koramangala_safest"]
        _, breakdown, _ = compute_night_score(safest_fixture["signals"], safest_fixture["gap_km"])
        assert breakdown["activity"]["known"] is False
        assert breakdown["cctv"]["known"] is False


# ---------------------------------------------------------------------------
# CORS preflight
# ---------------------------------------------------------------------------

class TestCors:
    """Verify that OPTIONS preflights from the frontend origins are accepted."""

    PREFLIGHT_HEADERS = {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }

    def _preflight(self, origin: str):
        return client.options(
            "/api/v1/routes/compare",
            headers={"Origin": origin, **self.PREFLIGHT_HEADERS},
        )

    def test_preflight_localhost_8081_status(self):
        r = self._preflight("http://localhost:8081")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"

    def test_preflight_localhost_8081_acao_header(self):
        r = self._preflight("http://localhost:8081")
        assert r.headers.get("access-control-allow-origin") == "http://localhost:8081"

    def test_preflight_127_8081_status(self):
        r = self._preflight("http://127.0.0.1:8081")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"

    def test_preflight_127_8081_acao_header(self):
        r = self._preflight("http://127.0.0.1:8081")
        assert r.headers.get("access-control-allow-origin") == "http://127.0.0.1:8081"

    def test_preflight_localhost_8080_still_works(self):
        """Existing default origin must not be broken by the change."""
        r = self._preflight("http://localhost:8080")
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "http://localhost:8080"

    def test_preflight_unknown_origin_rejected(self):
        """An origin not in the allow-list must not receive the ACAO header."""
        r = self._preflight("http://evil.example.com")
        assert r.headers.get("access-control-allow-origin") != "http://evil.example.com"

    def test_preflight_allows_post_method(self):
        r = self._preflight("http://localhost:8081")
        acam = r.headers.get("access-control-allow-methods", "")
        assert "POST" in acam

    def test_preflight_allows_content_type_header(self):
        r = self._preflight("http://localhost:8081")
        acah = r.headers.get("access-control-allow-headers", "")
        assert "content-type" in acah.lower()


# ---------------------------------------------------------------------------
# Travel mode variants
# ---------------------------------------------------------------------------

class TestModes:
    def test_bike_mode_200(self):
        assert client.post("/api/v1/routes/compare", json={**VALID_BODY, "mode": "bike"}).status_code == 200

    def test_car_mode_200(self):
        assert client.post("/api/v1/routes/compare", json={**VALID_BODY, "mode": "car"}).status_code == 200

    def test_bike_faster_than_walk(self):
        walk_dur = client.post("/api/v1/routes/compare", json={**VALID_BODY, "mode": "walk"}).json()["fastest"]["durationMin"]
        bike_dur = client.post("/api/v1/routes/compare", json={**VALID_BODY, "mode": "bike"}).json()["fastest"]["durationMin"]
        assert bike_dur < walk_dur

    def test_car_faster_than_bike(self):
        bike_dur = client.post("/api/v1/routes/compare", json={**VALID_BODY, "mode": "bike"}).json()["fastest"]["durationMin"]
        car_dur  = client.post("/api/v1/routes/compare", json={**VALID_BODY, "mode": "car"}).json()["fastest"]["durationMin"]
        assert car_dur < bike_dur

    def test_non_walk_mode_note_added(self):
        notes = client.post("/api/v1/routes/compare", json={**VALID_BODY, "mode": "car"}).json()["fastest"]["notes"]
        assert any("demo estimate" in n.lower() for n in notes)
