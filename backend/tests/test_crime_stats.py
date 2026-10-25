"""
backend/tests/test_crime_stats.py

Automated tests for DataGovInCrimeProvider and GET /api/v1/crime-stats endpoint.
All external HTTP requests are mocked so tests never depend on live external networks.

Covers:
- Successful response with parsed records and pagination
- Empty records result
- Missing API key handling (status="missing_key")
- HTTP 403 Forbidden / invalid API key
- Timeout handling (bounded, status="unavailable")
- Malformed JSON handling (status="error")
- In-memory caching
- Full GET /api/v1/crime-stats endpoint integration
- Verify API key is never leaked in logs or responses
"""

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app
from crime_stats_provider import (
    DataGovInCrimeProvider,
    CrimeStatsCache,
    CrimeStatsResponse,
)
from routers.crime_stats import get_crime_provider

client = TestClient(app)

MOCK_RESOURCE_ID = "12345678-1234-1234-1234-123456789abc"
SAMPLE_CRIME_RECORDS = [
    {
        "State/UT": "Karnataka",
        "District": "Bengaluru City",
        "Year": "2022",
        "Crime Head": "Cruelty by Husband or Relatives (Sec. 498A IPC)",
        "Cases Reported": "1,452",
    },
    {
        "State/UT": "Karnataka",
        "District": "Bengaluru City",
        "Year": "2022",
        "Crime Head": "Assault on Women with Intent to Outrage Modesty (Sec. 354 IPC)",
        "Cases Reported": "890",
    },
    {
        "State/UT": "Maharashtra",
        "District": "Mumbai",
        "Year": "2022",
        "Crime Head": "Cruelty by Husband or Relatives (Sec. 498A IPC)",
        "Cases Reported": "2,130",
    },
]


class TestCrimeStatsProviderUnit:
    """Unit tests for DataGovInCrimeProvider."""

    def test_success_response(self):
        """Verify successful response aggregates records, total, and metadata correctly."""
        def handler(request: httpx.Request) -> httpx.Response:
            assert f"/{MOCK_RESOURCE_ID}" in str(request.url)
            assert "api-key=test_secret_key" in str(request.url)
            return httpx.Response(
                status_code=200,
                json={
                    "total": 3,
                    "records": SAMPLE_CRIME_RECORDS,
                    "period": "2022",
                },
            )

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = DataGovInCrimeProvider(
            api_key="test_secret_key",
            resource_id=MOCK_RESOURCE_ID,
            cache=CrimeStatsCache(),
            client=mock_client,
        )

        res = provider.get_crime_statistics(offset=0, limit=20)

        assert res.status == "available"
        assert res.total_records == 3
        assert len(res.records) == 3
        assert res.records[0].state_ut == "Karnataka"
        assert res.records[0].district_or_city == "Bengaluru City"
        assert res.records[0].year == "2022"
        assert res.records[0].cases_registered == 1452
        assert "498A" in (res.records[0].crime_head or "")
        assert res.retrieved_at is not None
        assert "NCRB" in res.source
        assert any("street-level" in lim.lower() for lim in res.limitations)

    def test_empty_results(self):
        """Verify response when provider returns empty records array."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=200, json={"total": 0, "records": []})

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = DataGovInCrimeProvider(
            api_key="test_secret_key",
            resource_id=MOCK_RESOURCE_ID,
            cache=CrimeStatsCache(),
            client=mock_client,
        )

        res = provider.get_crime_statistics()
        assert res.status == "available"
        assert res.total_records == 0
        assert len(res.records) == 0

    def test_missing_api_key(self):
        """Verify provider returns status='missing_key' without making network request if key is absent."""
        called = False

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal called
            called = True
            return httpx.Response(status_code=200, json={})

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = DataGovInCrimeProvider(
            api_key="",  # Empty key
            resource_id=MOCK_RESOURCE_ID,
            cache=CrimeStatsCache(),
            client=mock_client,
        )

        res = provider.get_crime_statistics()
        assert res.status == "missing_key"
        assert not called
        assert any("DATA_GOV_IN_API_KEY" in note for note in res.notes)

    def test_http_403_forbidden(self):
        """Verify HTTP 403 returns explicit error status without crashing."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=403, text="Forbidden: Invalid API key")

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = DataGovInCrimeProvider(
            api_key="test_secret_key",
            resource_id=MOCK_RESOURCE_ID,
            cache=CrimeStatsCache(),
            client=mock_client,
        )

        res = provider.get_crime_statistics()
        assert res.status == "error"
        assert any("403" in note for note in res.notes)

    def test_timeout_handling(self):
        """Verify timeout raises no unhandled exception and returns status='unavailable'."""
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.TimeoutException("Read timed out")

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = DataGovInCrimeProvider(
            api_key="test_secret_key",
            resource_id=MOCK_RESOURCE_ID,
            timeout_sec=3.0,
            cache=CrimeStatsCache(),
            client=mock_client,
        )

        res = provider.get_crime_statistics()
        assert res.status == "unavailable"
        assert res.retrieved_at is None
        assert any("timed out" in note.lower() for note in res.notes)

    def test_malformed_json_handling(self):
        """Verify non-JSON response returns error status without crashing."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=200, text="<html>Gateway Error</html>")

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = DataGovInCrimeProvider(
            api_key="test_secret_key",
            resource_id=MOCK_RESOURCE_ID,
            cache=CrimeStatsCache(),
            client=mock_client,
        )

        res = provider.get_crime_statistics()
        assert res.status == "error"
        assert any("parse" in note.lower() for note in res.notes)

    def test_cache_hit_avoids_repeated_network_calls(self):
        """Verify in-memory cache returns cached statistics for identical parameters."""
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(status_code=200, json={"total": 1, "records": [SAMPLE_CRIME_RECORDS[0]]})

        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        cache = CrimeStatsCache(ttl_seconds=300.0)
        provider = DataGovInCrimeProvider(
            api_key="test_secret_key",
            resource_id=MOCK_RESOURCE_ID,
            cache=cache,
            client=mock_client,
        )

        res1 = provider.get_crime_statistics(offset=0, limit=10)
        assert call_count == 1
        assert res1.status == "available"

        res2 = provider.get_crime_statistics(offset=0, limit=10)
        assert call_count == 1  # Cache hit, no second network request
        assert res2.status == "available"

    def test_api_key_not_in_logs(self, caplog):
        """Verify the secret API key is never printed or logged."""
        import logging

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=200, json={"records": []})

        secret_token = "ultra_confidential_token_xyz999"
        mock_client = httpx.Client(transport=httpx.MockTransport(handler))
        provider = DataGovInCrimeProvider(
            api_key=secret_token,
            resource_id=MOCK_RESOURCE_ID,
            cache=CrimeStatsCache(),
            client=mock_client,
        )

        with caplog.at_level(logging.INFO, logger="nightwise.crime_stats"):
            provider.get_crime_statistics()

        assert secret_token not in caplog.text


class TestCrimeStatsEndpointIntegration:
    """Integration tests for GET /api/v1/crime-stats."""

    def test_endpoint_success(self):
        """Verify GET /api/v1/crime-stats returns 200 with structured statistics."""
        class MockCrimeProvider(DataGovInCrimeProvider):
            def get_crime_statistics(self, offset=0, limit=20, state=None, year=None):
                return CrimeStatsResponse(
                    source="data.gov.in / NCRB",
                    attribution="Ministry of Home Affairs",
                    resource_id=MOCK_RESOURCE_ID,
                    status="available",
                    retrieved_at="2026-10-25T12:00:00Z",
                    total_records=len(SAMPLE_CRIME_RECORDS),
                    limit=limit,
                    offset=offset,
                    records=[
                        {
                            "state_ut": "Karnataka",
                            "district_or_city": "Bengaluru City",
                            "year": "2022",
                            "crime_head": "Assault on Women (Sec. 354 IPC)",
                            "cases_registered": 890,
                        }
                    ],
                    limitations=[
                        "Official statistics represent reported police cases at State/Metro level.",
                        "Not to be used as street-level safety scores.",
                    ],
                )

        app.dependency_overrides[get_crime_provider] = lambda: MockCrimeProvider()
        try:
            r = client.get("/api/v1/crime-stats?offset=0&limit=10")
            assert r.status_code == 200
            data = r.json()
            assert data["status"] == "available"
            assert data["total_records"] == 3
            assert len(data["records"]) == 1
            assert data["records"][0]["state_ut"] == "Karnataka"
            assert data["records"][0]["cases_registered"] == 890
            assert any("street-level" in lim.lower() for lim in data["limitations"])
        finally:
            app.dependency_overrides.pop(get_crime_provider, None)
