"""
backend/tests/test_safety_data.py

Tests for the synthetic Bengaluru safety dataset endpoint GET /api/v1/safety-data.

Verifies:
- Successful retrieval of full synthetic dataset
- Verification that all records are clearly labeled as synthetic/demo
- Filtering by valid signal_type categories (public_transport, lighting, etc.)
- Case-insensitivity and alias handling (e.g. community_report)
- Graceful handling of unknown / non-existent filters
- Graceful handling of missing or corrupted dataset files
"""

from unittest.mock import patch
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_get_all_safety_data():
    """Verify endpoint returns complete synthetic dataset with disclaimer and required fields."""
    response = client.get("/api/v1/safety-data")
    assert response.status_code == 200

    data = response.json()
    assert "records" in data
    assert "total" in data
    assert "disclaimer" in data
    assert "DEMO DATA — NOT VERIFIED" in data["disclaimer"]

    records = data["records"]
    assert len(records) >= 15
    assert data["total"] == len(records)
    assert data["signal_type"] is None

    # Verify all records contain required fields and demo markers
    for record in records:
        assert record["id"]
        assert record["location"]
        assert isinstance(record["latitude"], float)
        assert isinstance(record["longitude"], float)
        assert record["signal_type"]
        assert record["description"]
        assert "source" in record
        assert "status" in record
        assert record["is_demo"] is True
        # Synthetic indicators check
        assert "synthetic" in record["source"].lower() or "demo" in record["source"].lower()
        assert "simulated" in record["status"].lower() or "demo" in record["status"].lower()


def test_filter_by_valid_signal_types():
    """Verify filtering by specific valid signal_type categories."""
    categories = ["public_transport", "assistance_point", "lighting", "cctv", "community_safety_report"]
    for cat in categories:
        response = client.get(f"/api/v1/safety-data?signal_type={cat}")
        assert response.status_code == 200

        data = response.json()
        assert data["signal_type"] == cat
        records = data["records"]
        assert len(records) > 0
        assert data["total"] == len(records)

        for record in records:
            assert record["signal_type"] == cat
            assert record["is_demo"] is True


def test_filter_case_insensitivity_and_whitespace():
    """Verify filter is case-insensitive and trims whitespace."""
    response = client.get("/api/v1/safety-data?signal_type=  LIGHTING  ")
    assert response.status_code == 200

    data = response.json()
    records = data["records"]
    assert len(records) > 0
    for record in records:
        assert record["signal_type"] == "lighting"


def test_filter_by_alias_community_report():
    """Verify alias 'community_report' matches 'community_safety_report'."""
    response = client.get("/api/v1/safety-data?signal_type=community_report")
    assert response.status_code == 200

    data = response.json()
    records = data["records"]
    assert len(records) > 0
    for record in records:
        assert record["signal_type"] == "community_safety_report"


def test_filter_by_unknown_or_invalid_signal_type():
    """Verify unknown or invalid filter returns empty records gracefully without 4xx/5xx errors."""
    response = client.get("/api/v1/safety-data?signal_type=invalid_category_xyz")
    assert response.status_code == 200

    data = response.json()
    assert data["records"] == []
    assert data["total"] == 0
    assert data["signal_type"] == "invalid_category_xyz"
    assert "DEMO DATA — NOT VERIFIED" in data["disclaimer"]


def test_missing_data_file_handled_gracefully():
    """Verify missing JSON file returns empty list gracefully instead of 500 error."""
    with patch("routers.safety_data.DATA_PATH") as mock_path:
        mock_path.exists.return_value = False
        response = client.get("/api/v1/safety-data")
        assert response.status_code == 200
        data = response.json()
        assert data["records"] == []
        assert data["total"] == 0
        assert "disclaimer" in data


def test_corrupted_data_file_handled_gracefully():
    """Verify corrupted JSON entries are skipped gracefully."""
    malformed_records = [
        {"id": "valid-1", "location": "Test Loc", "latitude": 12.9, "longitude": 77.6, "signal_type": "lighting", "description": "Demo", "source": "Demo", "status": "simulated_demo"},
        {"id": "bad-2", "latitude": "not-a-number"},  # malformed float
    ]
    with patch("routers.safety_data.load_demo_records", return_value=malformed_records):
        response = client.get("/api/v1/safety-data")
        assert response.status_code == 200
        data = response.json()
        assert len(data["records"]) == 1
        assert data["records"][0]["id"] == "valid-1"
