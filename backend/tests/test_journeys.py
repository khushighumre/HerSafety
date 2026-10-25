"""
backend/tests/test_journeys.py

Tests for Phase 2 Active Journeys:
1. Successful creation and database persistence (POST /api/v1/journeys, HTTP 201)
2. Listing saved journeys, newest first (GET /api/v1/journeys)
3. Retrieving a journey by ID (GET /api/v1/journeys/{journey_id})
4. Input validation (missing origin, missing destination, invalid travel mode, invalid status)
5. Unknown ID returning HTTP 404
"""

import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app
from database import get_db, SessionLocal, Base, engine, init_db
from models import Journey, CheckIn

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_journeys_table():
    """Ensure test isolation by creating tables and clearing journeys and check-ins between tests."""
    init_db()
    with SessionLocal() as db:
        db.query(CheckIn).delete()
        db.query(Journey).delete()
        db.commit()
    yield
    with SessionLocal() as db:
        db.query(CheckIn).delete()
        db.query(Journey).delete()
        db.commit()


def test_create_journey_success():
    """POST /api/v1/journeys returns 201 and persists to database."""
    payload = {
        "origin": "MG Road, Bengaluru",
        "destination": "Koramangala 5th Block, Bengaluru",
        "travel_mode": "walk",
        "planned_departure_time": "2026-10-25T21:00:00Z",
        "status": "planned",
    }
    response = client.post("/api/v1/journeys", json=payload)
    assert response.status_code == 201
    data = response.json()

    assert "id" in data
    assert data["id"] > 0
    assert data["origin"] == "MG Road, Bengaluru"
    assert data["destination"] == "Koramangala 5th Block, Bengaluru"
    assert data["origin_name"] == "MG Road, Bengaluru"
    assert data["destination_name"] == "Koramangala 5th Block, Bengaluru"
    assert data["travel_mode"] == "walk"
    assert data["transport_mode"] == "walk"
    assert data["status"] == "planned"
    assert data["planned_departure_time"] is not None
    assert "created_at" in data

    # Verify database persistence
    with SessionLocal() as db:
        journey_in_db = db.query(Journey).filter(Journey.id == data["id"]).first()
        assert journey_in_db is not None
        assert journey_in_db.origin_name == "MG Road, Bengaluru"
        assert journey_in_db.destination_name == "Koramangala 5th Block, Bengaluru"
        assert journey_in_db.transport_mode == "walk"
        assert journey_in_db.status == "planned"


def test_create_journey_with_alias_fields():
    """POST /api/v1/journeys accepts legacy/alias fields origin_name and transport_mode."""
    payload = {
        "origin_name": "Indiranagar 100ft Road",
        "destination_name": "Domlur Flyover",
        "transport_mode": "bike",
    }
    response = client.post("/api/v1/journeys", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["origin"] == "Indiranagar 100ft Road"
    assert data["destination"] == "Domlur Flyover"
    assert data["travel_mode"] == "bike"
    assert data["status"] == "planned"


def test_list_journeys_newest_first():
    """GET /api/v1/journeys returns all journeys ordered newest first."""
    client.post("/api/v1/journeys", json={"origin": "Point A", "destination": "Point B", "travel_mode": "walk"})
    client.post("/api/v1/journeys", json={"origin": "Point C", "destination": "Point D", "travel_mode": "car"})
    client.post("/api/v1/journeys", json={"origin": "Point E", "destination": "Point F", "travel_mode": "bike"})

    response = client.get("/api/v1/journeys")
    assert response.status_code == 200
    journeys = response.json()
    assert len(journeys) == 3

    # Newest first
    assert journeys[0]["origin"] == "Point E"
    assert journeys[1]["origin"] == "Point C"
    assert journeys[2]["origin"] == "Point A"


def test_get_journey_by_id_success():
    """GET /api/v1/journeys/{journey_id} retrieves a specific journey."""
    post_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Majestic Bus Station", "destination": "Jayanagar 4th Block", "travel_mode": "car"},
    )
    assert post_res.status_code == 201
    created_id = post_res.json()["id"]

    get_res = client.get(f"/api/v1/journeys/{created_id}")
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["id"] == created_id
    assert data["origin"] == "Majestic Bus Station"
    assert data["destination"] == "Jayanagar 4th Block"
    assert data["travel_mode"] == "car"


def test_get_journey_not_found_returns_404():
    """GET /api/v1/journeys/{journey_id} returns 404 for an unknown ID."""
    response = client.get("/api/v1/journeys/9999999")
    assert response.status_code == 404
    detail = response.json().get("detail", "")
    assert "not found" in detail.lower()


def test_create_journey_validation_missing_origin():
    """POST /api/v1/journeys rejects missing or empty origin with 422."""
    res_empty = client.post("/api/v1/journeys", json={"origin": "   ", "destination": "Koramangala"})
    assert res_empty.status_code == 422

    res_missing = client.post("/api/v1/journeys", json={"destination": "Koramangala"})
    assert res_missing.status_code == 422


def test_create_journey_validation_missing_destination():
    """POST /api/v1/journeys rejects missing or empty destination with 422."""
    res_empty = client.post("/api/v1/journeys", json={"origin": "MG Road", "destination": "   "})
    assert res_empty.status_code == 422

    res_missing = client.post("/api/v1/journeys", json={"origin": "MG Road"})
    assert res_missing.status_code == 422


def test_create_journey_validation_invalid_travel_mode():
    """POST /api/v1/journeys rejects invalid travel mode with 422."""
    res = client.post(
        "/api/v1/journeys",
        json={"origin": "MG Road", "destination": "Koramangala", "travel_mode": "submarine"},
    )
    assert res.status_code == 422
    assert "travel mode" in str(res.json()).lower()


def test_create_journey_validation_invalid_status():
    """POST /api/v1/journeys rejects invalid status with 422."""
    res = client.post(
        "/api/v1/journeys",
        json={"origin": "MG Road", "destination": "Koramangala", "status": "teleporting"},
    )
    assert res.status_code == 422
    assert "status" in str(res.json()).lower()


def test_started_at_persistence_and_refresh_immutability():
    """GET /api/v1/journeys/{id} returns the exact persisted started_at and never resets it."""
    specific_start = "2026-10-25T10:15:30Z"
    post_res = client.post(
        "/api/v1/journeys",
        json={
            "origin": "MG Road",
            "destination": "Koramangala",
            "travel_mode": "walk",
            "status": "active",
            "started_at": specific_start,
        },
    )
    assert post_res.status_code == 201
    journey_id = post_res.json()["id"]
    initial_started_at = post_res.json()["started_at"]
    assert "2026-10-25" in initial_started_at

    # Simulate page refresh 1: GET /api/v1/journeys/{id}
    refresh_1 = client.get(f"/api/v1/journeys/{journey_id}")
    assert refresh_1.status_code == 200
    assert refresh_1.json()["started_at"] == initial_started_at

    # Simulate page refresh 2: GET list /api/v1/journeys
    refresh_2 = client.get("/api/v1/journeys")
    assert refresh_2.status_code == 200
    found = [j for j in refresh_2.json() if j["id"] == journey_id]
    assert len(found) == 1
    assert found[0]["started_at"] == initial_started_at


def test_start_journey_endpoint_persists_started_at():
    """POST /api/v1/journeys/{id}/start starts a planned journey and records started_at."""
    create_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Indiranagar", "destination": "Domlur", "status": "planned"},
    )
    assert create_res.status_code == 201
    journey_id = create_res.json()["id"]

    start_res = client.post(f"/api/v1/journeys/{journey_id}/start")
    assert start_res.status_code == 200
    start_data = start_res.json()
    assert start_data["status"] == "active"
    assert "started_at" in start_data
    saved_started_at = start_data["started_at"]

    # Verify persisted in database and unchanged on subsequent GETs
    get_res = client.get(f"/api/v1/journeys/{journey_id}")
    assert get_res.status_code == 200
    assert get_res.json()["started_at"] == saved_started_at
    assert get_res.json()["status"] == "active"


def test_patch_journey_updates_status_and_ended_at():
    """PATCH /api/v1/journeys/{id} marks journey completed and records ended_at."""
    create_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Majestic", "destination": "Jayanagar", "status": "active"},
    )
    journey_id = create_res.json()["id"]

    patch_res = client.patch(
        f"/api/v1/journeys/{journey_id}",
        json={"status": "completed"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "completed"
    assert patch_res.json()["ended_at"] is not None


def test_repeated_start_rejected_and_does_not_reset_timestamp():
    """Repeated start requests on an active journey return 400 and preserve started_at."""
    create_res = client.post(
        "/api/v1/journeys",
        json={"origin": "MG Road", "destination": "Indiranagar", "status": "planned"},
    )
    journey_id = create_res.json()["id"]

    # First start
    start_1 = client.post(f"/api/v1/journeys/{journey_id}/start")
    assert start_1.status_code == 200
    initial_start_time = start_1.json()["started_at"]

    # Repeated start attempt
    start_2 = client.post(f"/api/v1/journeys/{journey_id}/start")
    assert start_2.status_code == 400
    assert "already active" in start_2.json().get("detail", "").lower()

    # Verify started_at was not reset or overwritten
    get_res = client.get(f"/api/v1/journeys/{journey_id}")
    assert get_res.json()["started_at"] == initial_start_time


def test_complete_journey_endpoint_and_validation():
    """POST /api/v1/journeys/{id}/complete transitions active to completed and validates states."""
    # 1. Complete planned journey should fail with 400
    planned_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Point A", "destination": "Point B", "status": "planned"},
    )
    p_id = planned_res.json()["id"]
    comp_planned = client.post(f"/api/v1/journeys/{p_id}/complete")
    assert comp_planned.status_code == 400
    assert "not started" in comp_planned.json().get("detail", "").lower()

    # 2. Complete active journey should succeed (200)
    active_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Point C", "destination": "Point D", "status": "active"},
    )
    a_id = active_res.json()["id"]
    comp_active = client.post(f"/api/v1/journeys/{a_id}/complete")
    assert comp_active.status_code == 200
    assert comp_active.json()["status"] == "completed"
    assert comp_active.json()["ended_at"] is not None

    # 3. Repeated completion on already completed journey should fail with 400
    comp_again = client.post(f"/api/v1/journeys/{a_id}/complete")
    assert comp_again.status_code == 400
    assert "already completed" in comp_again.json().get("detail", "").lower()


def test_cancel_journey_endpoint_for_planned_and_active():
    """POST /api/v1/journeys/{id}/cancel supports planned and active journeys and persists ended_at."""
    # 1. Cancel planned journey
    p_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Koramangala", "destination": "HSR Layout", "status": "planned"},
    )
    p_id = p_res.json()["id"]
    can_p = client.post(f"/api/v1/journeys/{p_id}/cancel")
    assert can_p.status_code == 200
    assert can_p.json()["status"] == "cancelled"
    assert can_p.json()["ended_at"] is not None

    # 2. Cancel active journey
    a_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Whitefield", "destination": "Marathahalli", "status": "active"},
    )
    a_id = a_res.json()["id"]
    can_a = client.post(f"/api/v1/journeys/{a_id}/cancel")
    assert can_a.status_code == 200
    assert can_a.json()["status"] == "cancelled"
    assert can_a.json()["ended_at"] is not None

    # 3. Repeated cancellation fails with 400
    can_again = client.post(f"/api/v1/journeys/{a_id}/cancel")
    assert can_again.status_code == 400
    assert "already cancelled" in can_again.json().get("detail", "").lower()


def test_terminal_status_cannot_be_reopened():
    """Completed and cancelled journeys cannot transition back to active."""
    # Create active and complete
    res = client.post(
        "/api/v1/journeys",
        json={"origin": "Origin", "destination": "Dest", "status": "active"},
    )
    j_id = res.json()["id"]
    client.post(f"/api/v1/journeys/{j_id}/complete")

    # Try starting completed journey via start endpoint -> 400
    start_attempt = client.post(f"/api/v1/journeys/{j_id}/start")
    assert start_attempt.status_code == 400
    assert "completed" in start_attempt.json().get("detail", "").lower()

    # Try updating completed journey to active via patch -> 400
    patch_attempt = client.patch(f"/api/v1/journeys/{j_id}", json={"status": "active"})
    assert patch_attempt.status_code == 400
    assert "cannot transition" in patch_attempt.json().get("detail", "").lower()


def test_lifecycle_endpoints_with_unknown_id_return_404():
    """Start, complete, and cancel endpoints return 404 for unknown IDs."""
    assert client.post("/api/v1/journeys/999999/start").status_code == 404
    assert client.post("/api/v1/journeys/999999/complete").status_code == 404
    assert client.post("/api/v1/journeys/999999/cancel").status_code == 404
    assert client.patch("/api/v1/journeys/999999", json={"status": "active"}).status_code == 404


# ---------------------------------------------------------------------------
# Phase 2, Part 3: Persistent Safety Check-ins Tests
# ---------------------------------------------------------------------------

def test_create_check_in_on_active_journey_success():
    """POST /api/v1/journeys/{id}/check-ins creates and persists a check-in record."""
    # 1. Create an active journey
    j_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Indiranagar", "destination": "Koramangala", "status": "active"},
    )
    assert j_res.status_code == 201
    journey_id = j_res.json()["id"]

    # 2. Post a check-in
    ci_res = client.post(f"/api/v1/journeys/{journey_id}/check-ins", json={})
    assert ci_res.status_code == 201
    ci_data = ci_res.json()

    assert "id" in ci_data
    assert ci_data["journey_id"] == journey_id
    assert ci_data["status"] == "confirmed"
    assert ci_data["created_at"] is not None
    assert ci_data["responded_at"] is not None

    # 3. Verify SQLite persistence directly
    with SessionLocal() as db:
        record = db.query(CheckIn).filter(CheckIn.id == ci_data["id"]).first()
        assert record is not None
        assert record.journey_id == journey_id
        assert record.status == "confirmed"
        assert record.created_at is not None
        assert record.responded_at is not None


def test_create_check_in_with_note_and_coordinates():
    """Check-in endpoint accepts optional note, lat, lng and persists them."""
    j_res = client.post(
        "/api/v1/journeys",
        json={"origin": "MG Road", "destination": "Brigade Road", "status": "active"},
    )
    journey_id = j_res.json()["id"]

    ci_res = client.post(
        f"/api/v1/journeys/{journey_id}/check-ins",
        json={"note": "Passing metro gate 2, feeling safe", "lat": 12.9756, "lng": 77.6068},
    )
    assert ci_res.status_code == 201
    data = ci_res.json()
    assert data["note"] == "Passing metro gate 2, feeling safe"
    assert data["lat"] == 12.9756
    assert data["lng"] == 77.6068


def test_list_check_ins_ordered_newest_first():
    """GET /api/v1/journeys/{id}/check-ins returns all check-ins for the journey, newest first."""
    j_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Hebbal", "destination": "Airport", "status": "active"},
    )
    journey_id = j_res.json()["id"]

    # Post 3 check-ins
    c1 = client.post(f"/api/v1/journeys/{journey_id}/check-ins", json={"note": "First check-in"}).json()
    c2 = client.post(f"/api/v1/journeys/{journey_id}/check-ins", json={"note": "Second check-in"}).json()
    c3 = client.post(f"/api/v1/journeys/{journey_id}/check-ins", json={"note": "Third check-in"}).json()

    list_res = client.get(f"/api/v1/journeys/{journey_id}/check-ins")
    assert list_res.status_code == 200
    check_ins = list_res.json()

    assert len(check_ins) == 3
    # Ordered newest first (descending ID)
    assert check_ins[0]["id"] == c3["id"]
    assert check_ins[0]["note"] == "Third check-in"
    assert check_ins[1]["id"] == c2["id"]
    assert check_ins[2]["id"] == c1["id"]


def test_check_in_persistence_across_repeated_reads():
    """Check-ins remain completely consistent across multiple repeated reads."""
    j_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Jayanagar", "destination": "JP Nagar", "status": "active"},
    )
    journey_id = j_res.json()["id"]

    ci_create = client.post(
        f"/api/v1/journeys/{journey_id}/check-ins",
        json={"note": "Checkpoint 1"},
    ).json()

    # Read 1
    read1 = client.get(f"/api/v1/journeys/{journey_id}/check-ins").json()
    # Read 2
    read2 = client.get(f"/api/v1/journeys/{journey_id}/check-ins").json()

    assert read1 == read2
    assert read1[0]["id"] == ci_create["id"]
    assert read1[0]["created_at"] == ci_create["created_at"]
    assert read1[0]["responded_at"] == ci_create["responded_at"]


def test_check_in_unknown_journey_returns_404():
    """Creating or listing check-ins for non-existent journey returns 404."""
    create_res = client.post("/api/v1/journeys/999999/check-ins", json={})
    assert create_res.status_code == 404
    assert "not found" in create_res.json().get("detail", "").lower()

    list_res = client.get("/api/v1/journeys/999999/check-ins")
    assert list_res.status_code == 404
    assert "not found" in list_res.json().get("detail", "").lower()


def test_check_in_rejected_on_planned_journey():
    """Attempting check-in on a planned journey returns HTTP 400 Bad Request."""
    j_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Origin", "destination": "Dest", "status": "planned"},
    )
    journey_id = j_res.json()["id"]

    ci_res = client.post(f"/api/v1/journeys/{journey_id}/check-ins", json={})
    assert ci_res.status_code == 400
    assert "active" in ci_res.json().get("detail", "").lower()
    assert "planned" in ci_res.json().get("detail", "").lower()


def test_check_in_rejected_on_completed_journey():
    """Attempting check-in on a completed journey returns HTTP 400 Bad Request."""
    j_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Origin", "destination": "Dest", "status": "active"},
    )
    journey_id = j_res.json()["id"]
    client.post(f"/api/v1/journeys/{journey_id}/complete")

    ci_res = client.post(f"/api/v1/journeys/{journey_id}/check-ins", json={})
    assert ci_res.status_code == 400
    assert "active" in ci_res.json().get("detail", "").lower()
    assert "completed" in ci_res.json().get("detail", "").lower()


def test_check_in_rejected_on_cancelled_journey():
    """Attempting check-in on a cancelled journey returns HTTP 400 Bad Request."""
    j_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Origin", "destination": "Dest", "status": "active"},
    )
    journey_id = j_res.json()["id"]
    client.post(f"/api/v1/journeys/{journey_id}/cancel")

    ci_res = client.post(f"/api/v1/journeys/{journey_id}/check-ins", json={})
    assert ci_res.status_code == 400
    assert "active" in ci_res.json().get("detail", "").lower()
    assert "cancelled" in ci_res.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
# Phase 2, Part 4: Missed Safety Check-in Detection & Overdue Tests
# ---------------------------------------------------------------------------

def test_check_in_status_active_within_90s_not_overdue():
    """Active journey less than 90 seconds since start is not overdue."""
    now = datetime.now(timezone.utc)
    started_40s_ago = now - timedelta(seconds=40)

    with SessionLocal() as db:
        journey = Journey(
            origin_name="MG Road",
            destination_name="Indiranagar",
            transport_mode="walk",
            status="active",
            started_at=started_40s_ago,
        )
        db.add(journey)
        db.commit()
        db.refresh(journey)
        journey_id = journey.id

    res = client.get(f"/api/v1/journeys/{journey_id}/check-in-status")
    assert res.status_code == 200
    data = res.json()

    assert data["journey_id"] == journey_id
    assert data["journey_status"] == "active"
    assert data["is_overdue"] is False
    assert data["checkin_required"] is True
    assert data["seconds_overdue"] == 0
    assert 40 <= data["seconds_remaining"] <= 52
    assert data["checkin_interval_seconds"] == 90
    assert data["status_label"] in ("up_to_date", "due_soon")
    assert data["last_checkin_at"] is not None
    assert data["next_checkin_due_at"] is not None


def test_check_in_status_exactly_90s_boundary():
    """At exactly 90.0 seconds, journey is due but not yet overdue (overdue requires > 90s)."""
    now = datetime.now(timezone.utc)
    started_90s_ago = now - timedelta(seconds=90)

    with SessionLocal() as db:
        journey = Journey(
            origin_name="Point A",
            destination_name="Point B",
            transport_mode="walk",
            status="active",
            started_at=started_90s_ago,
        )
        db.add(journey)
        db.commit()
        db.refresh(journey)
        journey_id = journey.id

    res = client.get(f"/api/v1/journeys/{journey_id}/check-in-status")
    assert res.status_code == 200
    data = res.json()
    assert data["is_overdue"] is False or data["seconds_overdue"] <= 1
    assert data["checkin_required"] is True


def test_check_in_status_more_than_90s_is_overdue():
    """Active journey more than 90 seconds without check-in is marked overdue."""
    now = datetime.now(timezone.utc)
    started_125s_ago = now - timedelta(seconds=125)

    with SessionLocal() as db:
        journey = Journey(
            origin_name="Point C",
            destination_name="Point D",
            transport_mode="walk",
            status="active",
            started_at=started_125s_ago,
        )
        db.add(journey)
        db.commit()
        db.refresh(journey)
        journey_id = journey.id

    res = client.get(f"/api/v1/journeys/{journey_id}/check-in-status")
    assert res.status_code == 200
    data = res.json()

    assert data["journey_id"] == journey_id
    assert data["journey_status"] == "active"
    assert data["is_overdue"] is True
    assert data["checkin_required"] is True
    assert 30 <= data["seconds_overdue"] <= 40
    assert data["seconds_remaining"] == 0
    assert data["status_label"] == "overdue"


def test_recent_check_in_clears_overdue_status_immediately():
    """Recording a check-in on an overdue journey immediately clears overdue status."""
    now = datetime.now(timezone.utc)
    started_150s_ago = now - timedelta(seconds=150)

    with SessionLocal() as db:
        journey = Journey(
            origin_name="Point E",
            destination_name="Point F",
            transport_mode="walk",
            status="active",
            started_at=started_150s_ago,
        )
        db.add(journey)
        db.commit()
        db.refresh(journey)
        journey_id = journey.id

    # Verify initially overdue
    overdue_res = client.get(f"/api/v1/journeys/{journey_id}/check-in-status")
    assert overdue_res.json()["is_overdue"] is True
    assert overdue_res.json()["seconds_overdue"] > 0

    # User taps "I'm Okay" (check-in recorded)
    ci_res = client.post(f"/api/v1/journeys/{journey_id}/check-ins", json={"note": "I'm okay"})
    assert ci_res.status_code == 201

    # Overdue is cleared immediately
    cleared_res = client.get(f"/api/v1/journeys/{journey_id}/check-in-status")
    assert cleared_res.status_code == 200
    cleared_data = cleared_res.json()
    assert cleared_data["is_overdue"] is False
    assert cleared_data["seconds_overdue"] == 0
    assert cleared_data["seconds_remaining"] > 80
    assert cleared_data["status_label"] == "up_to_date"


def test_check_in_status_repeated_reads_are_idempotent():
    """Querying check-in status repeatedly never alters timestamps or database records."""
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        journey = Journey(
            origin_name="Repeated Read Origin",
            destination_name="Repeated Read Dest",
            transport_mode="walk",
            status="active",
            started_at=now - timedelta(seconds=20),
        )
        db.add(journey)
        db.commit()
        db.refresh(journey)
        j_id = journey.id

    r1 = client.get(f"/api/v1/journeys/{j_id}/check-in-status").json()
    r2 = client.get(f"/api/v1/journeys/{j_id}/check-in-status").json()

    assert r1["journey_id"] == r2["journey_id"]
    assert r1["is_overdue"] == r2["is_overdue"]
    assert r1["last_checkin_at"] == r2["last_checkin_at"]
    assert r1["next_checkin_due_at"] == r2["next_checkin_due_at"]


def test_check_in_status_non_active_journeys_never_overdue():
    """Planned, completed, and cancelled journeys are never marked overdue."""
    now = datetime.now(timezone.utc)
    old_time = now - timedelta(seconds=500)

    # Planned journey
    p_res = client.post(
        "/api/v1/journeys",
        json={"origin": "Origin P", "destination": "Dest P", "status": "planned"},
    )
    p_id = p_res.json()["id"]
    p_status = client.get(f"/api/v1/journeys/{p_id}/check-in-status").json()
    assert p_status["is_overdue"] is False
    assert p_status["checkin_required"] is False
    assert p_status["seconds_overdue"] == 0
    assert p_status["status_label"] == "not_required"

    # Completed journey (even if started hours ago)
    with SessionLocal() as db:
        c_j = Journey(
            origin_name="Origin C",
            destination_name="Dest C",
            transport_mode="walk",
            status="completed",
            started_at=old_time,
            ended_at=now,
        )
        db.add(c_j)
        db.commit()
        db.refresh(c_j)
        c_id = c_j.id

    c_status = client.get(f"/api/v1/journeys/{c_id}/check-in-status").json()
    assert c_status["is_overdue"] is False
    assert c_status["checkin_required"] is False
    assert c_status["seconds_overdue"] == 0
    assert c_status["status_label"] == "not_required"

    # Cancelled journey (even if started hours ago)
    with SessionLocal() as db:
        can_j = Journey(
            origin_name="Origin Can",
            destination_name="Dest Can",
            transport_mode="walk",
            status="cancelled",
            started_at=old_time,
            ended_at=now,
        )
        db.add(can_j)
        db.commit()
        db.refresh(can_j)
        can_id = can_j.id

    can_status = client.get(f"/api/v1/journeys/{can_id}/check-in-status").json()
    assert can_status["is_overdue"] is False
    assert can_status["checkin_required"] is False
    assert can_status["seconds_overdue"] == 0
    assert can_status["status_label"] == "not_required"


def test_check_in_status_unknown_journey_returns_404():
    """Requesting check-in status for non-existent journey ID returns 404."""
    res = client.get("/api/v1/journeys/999999/check-in-status")
    assert res.status_code == 404
    assert "not found" in res.json().get("detail", "").lower()


def test_check_in_status_with_naive_database_timestamps():
    """Handles offset-naive datetimes from SQLite safely without TypeError."""
    # SQLite naive datetime (stored without tzinfo in UTC)
    naive_dt = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=110)
    with SessionLocal() as db:
        journey = Journey(
            origin_name="Naive Origin",
            destination_name="Naive Dest",
            transport_mode="walk",
            status="active",
            started_at=naive_dt,
        )
        db.add(journey)
        db.commit()
        db.refresh(journey)
        j_id = journey.id

    res = client.get(f"/api/v1/journeys/{j_id}/check-in-status")
    assert res.status_code == 200
    data = res.json()
    assert data["is_overdue"] is True
    assert data["seconds_overdue"] >= 15


