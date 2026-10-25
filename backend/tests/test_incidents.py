"""
backend/tests/test_incidents.py

Tests for Incident Reporting API:
1. Successful creation and HTTP 201
2. Reference format (HS-YYYY-NNNN) and uniqueness
3. Listing incidents (newest first, empty list)
4. Retrieving a specific incident by ID
5. HTTP 404 for unknown incident
6. Required-field and invalid-input validation
7. SQLite persistence
"""

import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app
from database import SessionLocal, init_db
from models import Incident

client = TestClient(app)

_REFERENCE_RE = re.compile(r"^HS-\d{4}-\d{4}$")


@pytest.fixture(autouse=True)
def clean_incidents_table():
    """Ensure test isolation by clearing incidents between tests."""
    init_db()
    with SessionLocal() as db:
        db.query(Incident).delete()
        db.commit()
    yield
    with SessionLocal() as db:
        db.query(Incident).delete()
        db.commit()


# ---------------------------------------------------------------------------
# Creation — HTTP 201
# ---------------------------------------------------------------------------

def test_create_incident_returns_201():
    """POST /api/v1/incidents returns 201 with all expected fields."""
    payload = {
        "title": "Threatening messages on Instagram",
        "category": "harassment",
        "severity": "high",
        "summary": "Received repeated threatening DMs from an unknown account.",
    }
    res = client.post("/api/v1/incidents", json=payload)
    assert res.status_code == 201
    data = res.json()

    assert data["title"] == "Threatening messages on Instagram"
    assert data["category"] == "harassment"
    assert data["severity"] == "high"
    assert data["summary"] == "Received repeated threatening DMs from an unknown account."
    assert data["status"] == "draft"
    assert "id" in data and data["id"] > 0
    assert "reference" in data
    assert "created_at" in data
    assert "updated_at" in data


# ---------------------------------------------------------------------------
# Reference format and uniqueness
# ---------------------------------------------------------------------------

def test_reference_format_matches_hs_yyyy_nnnn():
    """Created incident reference matches HS-YYYY-NNNN format with current year."""
    res = client.post("/api/v1/incidents", json={"title": "Test", "category": "phishing"})
    assert res.status_code == 201
    ref = res.json()["reference"]
    assert _REFERENCE_RE.match(ref), f"Reference '{ref}' does not match HS-YYYY-NNNN"
    current_year = str(datetime.now(timezone.utc).year)
    assert ref.startswith(f"HS-{current_year}-")


def test_references_are_unique_across_incidents():
    """Each created incident receives a distinct reference."""
    refs = set()
    for i in range(5):
        res = client.post("/api/v1/incidents", json={"title": f"Incident {i}", "category": "spam"})
        assert res.status_code == 201
        refs.add(res.json()["reference"])
    assert len(refs) == 5, "Duplicate references detected"


def test_reference_sequence_increments():
    """References increment sequentially: HS-YYYY-0001, HS-YYYY-0002, ..."""
    year = datetime.now(timezone.utc).year
    r1 = client.post("/api/v1/incidents", json={"title": "First", "category": "harassment"}).json()["reference"]
    r2 = client.post("/api/v1/incidents", json={"title": "Second", "category": "harassment"}).json()["reference"]
    r3 = client.post("/api/v1/incidents", json={"title": "Third", "category": "harassment"}).json()["reference"]

    assert r1 == f"HS-{year}-0001"
    assert r2 == f"HS-{year}-0002"
    assert r3 == f"HS-{year}-0003"


# ---------------------------------------------------------------------------
# Listing incidents
# ---------------------------------------------------------------------------

def test_list_incidents_empty():
    """GET /api/v1/incidents returns empty list when no incidents exist."""
    res = client.get("/api/v1/incidents")
    assert res.status_code == 200
    assert res.json() == []


def test_list_incidents_newest_first():
    """GET /api/v1/incidents returns incidents ordered newest first."""
    client.post("/api/v1/incidents", json={"title": "Alpha", "category": "harassment"})
    client.post("/api/v1/incidents", json={"title": "Beta", "category": "phishing"})
    client.post("/api/v1/incidents", json={"title": "Gamma", "category": "sextortion"})

    res = client.get("/api/v1/incidents")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 3
    assert items[0]["title"] == "Gamma"
    assert items[1]["title"] == "Beta"
    assert items[2]["title"] == "Alpha"


# ---------------------------------------------------------------------------
# Retrieve by ID
# ---------------------------------------------------------------------------

def test_get_incident_by_id_success():
    """GET /api/v1/incidents/{id} returns the correct incident."""
    create_res = client.post(
        "/api/v1/incidents",
        json={"title": "Account takeover attempt", "category": "account_compromise", "severity": "medium"},
    )
    assert create_res.status_code == 201
    incident_id = create_res.json()["id"]

    get_res = client.get(f"/api/v1/incidents/{incident_id}")
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["id"] == incident_id
    assert data["title"] == "Account takeover attempt"
    assert data["category"] == "account_compromise"
    assert data["severity"] == "medium"


# ---------------------------------------------------------------------------
# 404 for unknown incident
# ---------------------------------------------------------------------------

def test_get_incident_not_found_returns_404():
    """GET /api/v1/incidents/{id} returns 404 for an unknown ID."""
    res = client.get("/api/v1/incidents/9999999")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def test_create_incident_missing_title_returns_422():
    """POST /api/v1/incidents rejects missing title with 422."""
    res = client.post("/api/v1/incidents", json={"category": "harassment"})
    assert res.status_code == 422


def test_create_incident_missing_category_returns_422():
    """POST /api/v1/incidents rejects missing category with 422."""
    res = client.post("/api/v1/incidents", json={"title": "Some incident"})
    assert res.status_code == 422


def test_create_incident_empty_title_returns_422():
    """POST /api/v1/incidents rejects blank title with 422."""
    res = client.post("/api/v1/incidents", json={"title": "   ", "category": "harassment"})
    assert res.status_code == 422


def test_create_incident_empty_category_returns_422():
    """POST /api/v1/incidents rejects blank category with 422."""
    res = client.post("/api/v1/incidents", json={"title": "Valid title", "category": "   "})
    assert res.status_code == 422


def test_create_incident_invalid_severity_returns_422():
    """POST /api/v1/incidents rejects invalid severity with 422."""
    res = client.post(
        "/api/v1/incidents",
        json={"title": "Test", "category": "harassment", "severity": "critical"},
    )
    assert res.status_code == 422
    assert "severity" in res.json()["detail"].lower()


def test_create_incident_default_severity_is_medium():
    """POST /api/v1/incidents uses 'medium' as default severity."""
    res = client.post("/api/v1/incidents", json={"title": "No severity given", "category": "spam"})
    assert res.status_code == 201
    assert res.json()["severity"] == "medium"


def test_create_incident_default_status_is_draft():
    """POST /api/v1/incidents always sets status to 'draft'."""
    res = client.post("/api/v1/incidents", json={"title": "Draft check", "category": "phishing"})
    assert res.status_code == 201
    assert res.json()["status"] == "draft"


# ---------------------------------------------------------------------------
# Text trimming
# ---------------------------------------------------------------------------

def test_create_incident_trims_whitespace():
    """POST /api/v1/incidents trims leading/trailing whitespace from title and category."""
    res = client.post(
        "/api/v1/incidents",
        json={"title": "  Stalking via location sharing  ", "category": "  harassment  "},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Stalking via location sharing"
    assert data["category"] == "harassment"


# ---------------------------------------------------------------------------
# SQLite persistence
# ---------------------------------------------------------------------------

def test_create_incident_persists_to_database():
    """Created incident is retrievable directly from SQLite."""
    res = client.post(
        "/api/v1/incidents",
        json={"title": "Persistence check", "category": "impersonation", "severity": "low"},
    )
    assert res.status_code == 201
    incident_id = res.json()["id"]

    with SessionLocal() as db:
        record = db.query(Incident).filter(Incident.id == incident_id).first()
        assert record is not None
        assert record.title == "Persistence check"
        assert record.category == "impersonation"
        assert record.severity == "low"
        assert record.status == "draft"
        assert record.reference is not None
        assert _REFERENCE_RE.match(record.reference)
