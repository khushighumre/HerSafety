"""
backend/tests/test_community_reports.py

Unit and integration tests for Phase 3, Part 1:
Reliable community safety report submission and persistence in SQLite.
"""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app
from database import SessionLocal, init_db
from models import CommunityReport

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_community_reports_table():
    """Ensure test isolation by clearing community_reports table between tests."""
    init_db()
    with SessionLocal() as db:
        db.query(CommunityReport).delete()
        db.commit()
    yield
    with SessionLocal() as db:
        db.query(CommunityReport).delete()
        db.commit()


def test_create_report_success():
    """POST /api/v1/community-reports returns 201 and persists to SQLite."""
    payload = {
        "category": "poor-lighting",
        "title": "Streetlights off on 100ft road",
        "description": "Entire stretch between the metro station and junction has non-functional lights.",
        "area": "Indiranagar 100ft Rd",
        "lat": 12.9719,
        "lng": 77.6412,
    }

    res = client.post("/api/v1/community-reports", json=payload)
    assert res.status_code == 201
    data = res.json()

    assert data["id"] > 0
    assert data["category"] == "poor-lighting"
    assert data["title"] == "Streetlights off on 100ft road"
    assert "Entire stretch" in data["description"]
    assert data["area"] == "Indiranagar 100ft Rd"
    assert data["lat"] == 12.9719
    assert data["lng"] == 77.6412
    assert data["status"] == "unverified"
    assert data["is_demo"] is False
    assert data["reporter_label"] == "anonymous"
    assert data["verifications"] == 0
    assert "reported_at" in data
    assert "created_at" in data

    # Verify database persistence
    with SessionLocal() as db:
        saved = db.query(CommunityReport).filter(CommunityReport.id == data["id"]).first()
        assert saved is not None
        assert saved.category == "poor-lighting"
        assert saved.status == "unverified"
        assert saved.is_demo is False


def test_create_report_minimal():
    """Report can be created with only category and description; title is auto-derived."""
    payload = {
        "category": "unsafe-area",
        "description": "Footpath completely blocked and deserted after 9 PM.",
    }

    res = client.post("/api/v1/community-reports", json=payload)
    assert res.status_code == 201
    data = res.json()

    assert data["category"] == "unsafe-area"
    assert data["title"]  # Auto-generated title
    assert data["area"] is None
    assert data["lat"] is None
    assert data["lng"] is None
    assert data["status"] == "unverified"


def test_category_normalization():
    """Supports category aliases and normalizes them cleanly."""
    cases = [
        ("poor_lighting", "poor-lighting"),
        ("street harassment", "harassment"),
        ("stalking", "suspicious-activity"),
        ("transport_issue", "transport"),
        ("other", "other"),
    ]

    for raw, expected in cases:
        res = client.post(
            "/api/v1/community-reports",
            json={
                "category": raw,
                "description": f"Valid description for testing category normalization of {raw}.",
            },
        )
        assert res.status_code == 201
        assert res.json()["category"] == expected


def test_validation_invalid_category():
    """Submitting an unrecognized category returns 422."""
    res = client.post(
        "/api/v1/community-reports",
        json={
            "category": "alien-invasion",
            "description": "Something strange happened here.",
        },
    )
    assert res.status_code == 422
    assert "Invalid category" in res.text


def test_validation_missing_or_short_description():
    """Empty or short description returns 422."""
    # Empty description
    res = client.post(
        "/api/v1/community-reports",
        json={
            "category": "poor-lighting",
            "description": "   ",
        },
    )
    assert res.status_code == 422

    # Under 5 characters
    res2 = client.post(
        "/api/v1/community-reports",
        json={
            "category": "poor-lighting",
            "description": "Bad",
        },
    )
    assert res2.status_code == 422
    assert "5 characters" in res2.text


def test_validation_invalid_coordinates():
    """Out-of-range coordinates return 422."""
    res = client.post(
        "/api/v1/community-reports",
        json={
            "category": "poor-lighting",
            "description": "Valid description for coordinate test.",
            "lat": 105.0,  # Invalid (>90)
            "lng": 77.0,
        },
    )
    assert res.status_code == 422
    assert "Latitude" in res.text

    res2 = client.post(
        "/api/v1/community-reports",
        json={
            "category": "poor-lighting",
            "description": "Valid description for coordinate test.",
            "lat": 12.0,
            "lng": -250.0,  # Invalid (<-180)
        },
    )
    assert res2.status_code == 422
    assert "Longitude" in res2.text


def test_list_reports_persistence_and_order():
    """GET /api/v1/community-reports returns user-submitted reports newest first."""
    client.post(
        "/api/v1/community-reports",
        json={"category": "poor-lighting", "description": "First report submitted."},
    )
    client.post(
        "/api/v1/community-reports",
        json={"category": "harassment", "description": "Second report submitted."},
    )

    res = client.get("/api/v1/community-reports?include_demo=false")
    assert res.status_code == 200
    items = res.json()

    assert len(items) == 2
    # Newest (second) must come first
    assert items[0]["category"] == "harassment"
    assert items[1]["category"] == "poor-lighting"
    assert items[0]["id"] > items[1]["id"]
    assert items[0]["is_demo"] is False
    assert items[0]["status"] == "unverified"


def test_list_reports_with_demo_distinction():
    """GET /api/v1/community-reports includes demo reports when requested, clearly distinguished."""
    client.post(
        "/api/v1/community-reports",
        json={"category": "poor-lighting", "description": "A user-submitted report."},
    )

    res = client.get("/api/v1/community-reports?include_demo=true")
    assert res.status_code == 200
    items = res.json()

    # Must contain both real user report and demo records
    user_reports = [r for r in items if not r["is_demo"]]
    demo_reports = [r for r in items if r["is_demo"]]

    assert len(user_reports) == 1
    assert len(demo_reports) > 0
    assert user_reports[0]["status"] == "unverified"
    assert demo_reports[0]["is_demo"] is True


def test_list_reports_filter_by_category():
    """Filtering by category returns only matching reports."""
    client.post(
        "/api/v1/community-reports",
        json={"category": "poor-lighting", "description": "Lighting problem here."},
    )
    client.post(
        "/api/v1/community-reports",
        json={"category": "transport", "description": "Transport problem here."},
    )

    res = client.get("/api/v1/community-reports?category=transport&include_demo=false")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    assert items[0]["category"] == "transport"


def test_get_report_by_id_and_404():
    """GET /api/v1/community-reports/{id} returns single report or 404 for unknown ID."""
    create_res = client.post(
        "/api/v1/community-reports",
        json={"category": "poor-lighting", "description": "Testing single retrieval."},
    )
    report_id = create_res.json()["id"]

    res = client.get(f"/api/v1/community-reports/{report_id}")
    assert res.status_code == 200
    assert res.json()["id"] == report_id

    # Non-existent ID returns 404
    missing_res = client.get("/api/v1/community-reports/9999999")
    assert missing_res.status_code == 404
    assert "was not found" in missing_res.json()["detail"]


# ---------------------------------------------------------------------------
# Phase 3, Part 3: Verification & Moderation tests
# ---------------------------------------------------------------------------

MOD_HEADERS = {"X-Moderator-Key": "nightwise-dev-moderator-2026"}


def test_moderation_authorization_boundary():
    """Unauthenticated requests cannot access moderation queue or perform moderation."""
    # Listing moderation reports requires key
    unauth_list = client.get("/api/v1/community-reports/moderation/reports")
    assert unauth_list.status_code == 403
    assert "Moderator authorization required" in unauth_list.json()["detail"]

    bad_key_list = client.get(
        "/api/v1/community-reports/moderation/reports",
        headers={"X-Moderator-Key": "wrong-key"},
    )
    assert bad_key_list.status_code == 403

    # Moderating a report requires key
    create_res = client.post(
        "/api/v1/community-reports",
        json={"category": "poor-lighting", "description": "Need lighting fix."},
    )
    rep_id = create_res.json()["id"]

    unauth_mod = client.patch(
        f"/api/v1/community-reports/{rep_id}/moderation",
        json={"status": "verified"},
    )
    assert unauth_mod.status_code == 403

    # With valid key, access is granted
    auth_list = client.get(
        "/api/v1/community-reports/moderation/reports",
        headers=MOD_HEADERS,
    )
    assert auth_list.status_code == 200


def test_moderation_valid_lifecycle_transitions():
    """Valid status transitions (unverified -> under_review -> verified -> resolved) succeed."""
    create_res = client.post(
        "/api/v1/community-reports",
        json={"category": "poor-lighting", "description": "Streetlight broken on 12th main."},
    )
    rep_id = create_res.json()["id"]
    assert create_res.json()["status"] == "unverified"

    # 1. unverified -> under_review
    res1 = client.patch(
        f"/api/v1/community-reports/{rep_id}/moderation",
        headers=MOD_HEADERS,
        json={"status": "under_review", "moderator_note": "Assigned to area moderator."},
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "under_review"
    assert res1.json()["moderator_notes"] == "Assigned to area moderator."
    assert res1.json()["reviewed_at"] is not None

    # 2. under_review -> verified
    res2 = client.patch(
        f"/api/v1/community-reports/{rep_id}/moderation",
        headers=MOD_HEADERS,
        json={"status": "verified", "moderator_note": "Verified with multiple neighborhood sources."},
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "verified"

    # 3. verified -> resolved
    res3 = client.patch(
        f"/api/v1/community-reports/{rep_id}/moderation",
        headers=MOD_HEADERS,
        json={"status": "resolved", "moderator_note": "Municipality repaired lighting."},
    )
    assert res3.status_code == 200
    assert res3.json()["status"] == "resolved"


def test_moderation_reject_flow():
    """unverified -> rejected transition works cleanly."""
    create_res = client.post(
        "/api/v1/community-reports",
        json={"category": "other", "description": "Spam commercial ad description here."},
    )
    rep_id = create_res.json()["id"]

    res = client.patch(
        f"/api/v1/community-reports/{rep_id}/moderation",
        headers=MOD_HEADERS,
        json={"status": "rejected", "moderator_note": "Commercial spam, outside safety scope."},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"
    assert res.json()["moderator_notes"] == "Commercial spam, outside safety scope."


def test_moderation_invalid_transition_returns_422():
    """Attempting an invalid status transition (e.g. rejected directly to resolved) returns 422."""
    create_res = client.post(
        "/api/v1/community-reports",
        json={"category": "other", "description": "Report rejected initially."},
    )
    rep_id = create_res.json()["id"]

    # First reject it
    res = client.patch(
        f"/api/v1/community-reports/{rep_id}/moderation",
        headers=MOD_HEADERS,
        json={"status": "rejected"},
    )
    assert res.status_code == 200

    # Try invalid transition from rejected -> resolved
    invalid_res = client.patch(
        f"/api/v1/community-reports/{rep_id}/moderation",
        headers=MOD_HEADERS,
        json={"status": "resolved"},
    )
    assert invalid_res.status_code == 422
    assert "Invalid status transition" in invalid_res.json()["detail"]


def test_moderation_invalid_status_value_returns_422():
    """Passing an unknown status string returns 422."""
    create_res = client.post(
        "/api/v1/community-reports",
        json={"category": "poor-lighting", "description": "Testing invalid status string."},
    )
    rep_id = create_res.json()["id"]

    res = client.patch(
        f"/api/v1/community-reports/{rep_id}/moderation",
        headers=MOD_HEADERS,
        json={"status": "magically_fixed"},
    )
    assert res.status_code == 422
    assert "Invalid status" in res.text


def test_moderation_unknown_report_returns_404():
    """Moderating a non-existent report ID returns 404."""
    res = client.patch(
        "/api/v1/community-reports/999999/moderation",
        headers=MOD_HEADERS,
        json={"status": "verified"},
    )
    assert res.status_code == 404
    assert "was not found" in res.json()["detail"]


def test_public_responses_exclude_private_moderator_notes():
    """Public endpoints (list and get by id) do NOT expose private moderator notes."""
    create_res = client.post(
        "/api/v1/community-reports",
        json={"category": "harassment", "description": "Private note security check."},
    )
    rep_id = create_res.json()["id"]

    # Add private moderator note
    mod_res = client.patch(
        f"/api/v1/community-reports/{rep_id}/moderation",
        headers=MOD_HEADERS,
        json={"status": "verified", "moderator_note": "CONFIDENTIAL_INVESTIGATION_NOTE_123"},
    )
    assert mod_res.status_code == 200
    assert mod_res.json()["moderator_notes"] == "CONFIDENTIAL_INVESTIGATION_NOTE_123"

    # Public single retrieval
    pub_get = client.get(f"/api/v1/community-reports/{rep_id}")
    assert pub_get.status_code == 200
    assert "moderator_notes" not in pub_get.json()
    assert "CONFIDENTIAL_INVESTIGATION_NOTE_123" not in pub_get.text

    # Public list
    pub_list = client.get("/api/v1/community-reports?include_demo=false")
    assert pub_list.status_code == 200
    assert len(pub_list.json()) >= 1
    assert "moderator_notes" not in pub_list.json()[0]
    assert "CONFIDENTIAL_INVESTIGATION_NOTE_123" not in pub_list.text


def test_list_reports_filter_by_status():
    """GET /api/v1/community-reports?status=verified filters correctly."""
    r1 = client.post(
        "/api/v1/community-reports",
        json={"category": "poor-lighting", "description": "To be verified report."},
    ).json()
    r2 = client.post(
        "/api/v1/community-reports",
        json={"category": "unsafe-area", "description": "Remains unverified report."},
    ).json()

    # Moderate r1 to verified
    client.patch(
        f"/api/v1/community-reports/{r1['id']}/moderation",
        headers=MOD_HEADERS,
        json={"status": "verified"},
    )

    # Query only verified
    res_verified = client.get("/api/v1/community-reports?status=verified&include_demo=false")
    assert res_verified.status_code == 200
    items = res_verified.json()
    assert len(items) == 1
    assert items[0]["id"] == r1["id"]
    assert items[0]["status"] == "verified"

    # Query only unverified
    res_unverified = client.get("/api/v1/community-reports?status=unverified&include_demo=false")
    assert res_unverified.status_code == 200
    items_un = res_unverified.json()
    assert len(items_un) == 1
    assert items_un[0]["id"] == r2["id"]
    assert items_un[0]["status"] == "unverified"
