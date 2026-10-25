"""
backend/crime_stats_provider.py

Official data.gov.in / National Crime Records Bureau (NCRB) Crime Statistics Provider.

CRITICAL DISCLAIMER & PRINCIPLES:
- Official crime statistics represent reported police registrations at the State/UT or Metropolitan level.
- These macro-level statistics must NOT be converted into street-level or micro-location safety scores.
- Higher reporting numbers often indicate better police reporting mechanisms and victim support centers,
  not higher underlying danger.
- NightWise demo Night Activity Scores remain strictly separate and are not replaced by official crime data.
- API keys are never printed, logged, or exposed to frontend code or version control.
"""

from __future__ import annotations

import logging
import os
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger("nightwise.crime_stats")
logger.setLevel(logging.INFO)

DEFAULT_DATA_GOV_IN_ENDPOINT = "https://api.data.gov.in/resource"
DEFAULT_TIMEOUT_SEC = 8.0
DEFAULT_CONNECT_TIMEOUT_SEC = 3.0
DEFAULT_CACHE_TTL_SEC = 3600.0  # 1 hour (official crime statistics are static annual figures)
DEFAULT_MAX_CACHE_SIZE = 100


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CrimeRecord(BaseModel):
    state_ut: Optional[str] = None
    district_or_city: Optional[str] = None
    year: Optional[str] = None
    crime_head: Optional[str] = None
    cases_registered: Optional[int] = None
    crime_rate: Optional[float] = None
    chargesheet_rate: Optional[float] = None
    raw_fields: dict[str, Any] = Field(default_factory=dict)


class CrimeStatsResponse(BaseModel):
    source: str = "Open Government Data (OGD) Platform India (data.gov.in) / NCRB"
    attribution: str = "Ministry of Home Affairs / National Crime Records Bureau (NCRB)"
    endpoint: str = ""
    resource_id: str = ""
    retrieved_at: Optional[str] = None
    status: str = "unavailable"  # "available" | "unavailable" | "error" | "missing_key"
    reporting_period: Optional[str] = None
    geographic_level: str = "State/UT / Metropolitan City"
    total_records: int = 0
    limit: int = 20
    offset: int = 0
    records: list[CrimeRecord] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

class CrimeStatsCache:
    """Bounded in-memory LRU cache with TTL expiration for crime statistics."""

    def __init__(self, ttl_seconds: float = DEFAULT_CACHE_TTL_SEC, max_size: int = DEFAULT_MAX_CACHE_SIZE):
        self.ttl_seconds = ttl_seconds
        self.max_size = max_size
        self._cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        if key not in self._cache:
            return None
        created_at, val = self._cache[key]
        if time.time() - created_at > self.ttl_seconds:
            del self._cache[key]
            return None
        self._cache.move_to_end(key)
        return val

    def set(self, key: str, val: Any) -> None:
        if key in self._cache:
            del self._cache[key]
        elif len(self._cache) >= self.max_size:
            self._cache.popitem(last=False)
        self._cache[key] = (time.time(), val)

    def clear(self) -> None:
        self._cache.clear()

    def __len__(self) -> int:
        return len(self._cache)


_global_crime_cache = CrimeStatsCache()


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

class DataGovInCrimeProvider:
    """
    Client for querying official crime statistics from data.gov.in with bounded timeouts,
    safe error handling, response caching, and strict secret protection.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        resource_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        timeout_sec: Optional[float] = None,
        cache: Optional[CrimeStatsCache] = None,
        client: Optional[httpx.Client] = None,
    ):
        raw_key = api_key if api_key is not None else os.getenv("DATA_GOV_IN_API_KEY", "")
        self._api_key = raw_key.strip() if raw_key else ""

        raw_res = resource_id if resource_id is not None else os.getenv("DATA_GOV_IN_RESOURCE_ID", "")
        self.resource_id = raw_res.strip() if raw_res else ""

        self.endpoint = (
            endpoint.strip()
            if endpoint is not None
            else os.getenv("DATA_GOV_IN_ENDPOINT", DEFAULT_DATA_GOV_IN_ENDPOINT).strip()
        )
        self.timeout_sec = (
            timeout_sec
            if timeout_sec is not None
            else float(os.getenv("DATA_GOV_IN_TIMEOUT_SEC", str(DEFAULT_TIMEOUT_SEC)))
        )
        self.cache = cache if cache is not None else _global_crime_cache
        self._client = client

    def _get_client(self) -> httpx.Client:
        if self._client is not None:
            return self._client
        timeout = httpx.Timeout(
            timeout=self.timeout_sec,
            connect=min(DEFAULT_CONNECT_TIMEOUT_SEC, self.timeout_sec),
        )
        return httpx.Client(timeout=timeout)

    @staticmethod
    def _standard_limitations() -> list[str]:
        return [
            "Official crime statistics represent reported police registrations at the State/UT or Metropolitan level.",
            "These statistics must NOT be used as a proxy for street-level or micro-location safety scores.",
            "Higher reported figures often reflect greater community trust, active helpline reporting, and accessible police desks rather than higher crime incidence.",
            "NightWise Night Activity Scores are simulated demo indicators and are NOT derived from official police crime counts.",
        ]

    def get_crime_statistics(
        self,
        offset: int = 0,
        limit: int = 20,
        state: Optional[str] = None,
        year: Optional[str] = None,
    ) -> CrimeStatsResponse:
        """
        Fetch crime statistics with pagination and optional state/year filters.
        Never raises uncaught HTTP exceptions to callers.
        """
        # 1. Check API Key
        if not self._api_key:
            logger.warning("data.gov.in request skipped: DATA_GOV_IN_API_KEY is not configured.")
            return CrimeStatsResponse(
                endpoint=self.endpoint,
                resource_id=self.resource_id,
                status="missing_key",
                limit=limit,
                offset=offset,
                limitations=self._standard_limitations(),
                notes=["DATA_GOV_IN_API_KEY environment variable is not set. Statistics unavailable."],
            )

        # 2. Check Resource ID
        if not self.resource_id:
            logger.warning("data.gov.in request skipped: DATA_GOV_IN_RESOURCE_ID is not configured.")
            return CrimeStatsResponse(
                endpoint=self.endpoint,
                resource_id="",
                status="unavailable",
                limit=limit,
                offset=offset,
                limitations=self._standard_limitations(),
                notes=[
                    "DATA_GOV_IN_RESOURCE_ID is not configured in backend/.env. "
                    "Provide an official data.gov.in dataset resource ID to retrieve live tables."
                ],
            )

        # 3. Check Cache
        cache_key = f"{self.resource_id}:{offset}:{limit}:{state or ''}:{year or ''}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            logger.info("data.gov.in cache hit for key: %s", cache_key)
            return cached

        # 4. Construct Request URL and Parameters
        url = f"{self.endpoint.rstrip('/')}/{self.resource_id}"
        params: dict[str, Any] = {
            "api-key": self._api_key,
            "format": "json",
            "offset": offset,
            "limit": limit,
        }
        if state:
            params["filters[state]"] = state
        if year:
            params["filters[year]"] = year

        # Safe diagnostic log (never log api_key)
        host = urlparse(url).hostname or "api.data.gov.in"
        logger.info(
            "Querying data.gov.in | host: %s | resource_id: %s | offset: %d | limit: %d",
            host, self.resource_id, offset, limit,
        )

        t0 = time.time()
        try:
            client = self._get_client()
            resp = client.get(url, params=params)
            duration = time.time() - t0
        except httpx.TimeoutException:
            duration = time.time() - t0
            logger.warning("data.gov.in timed out after %.2fs", duration)
            return CrimeStatsResponse(
                endpoint=self.endpoint,
                resource_id=self.resource_id,
                status="unavailable",
                limit=limit,
                offset=offset,
                limitations=self._standard_limitations(),
                notes=[f"data.gov.in upstream query timed out ({self.timeout_sec}s)."],
            )
        except (httpx.RequestError, Exception) as exc:
            duration = time.time() - t0
            logger.warning("data.gov.in connection error: %s (%.2fs)", type(exc).__name__, duration)
            return CrimeStatsResponse(
                endpoint=self.endpoint,
                resource_id=self.resource_id,
                status="unavailable",
                limit=limit,
                offset=offset,
                limitations=self._standard_limitations(),
                notes=[f"Connection to data.gov.in failed: {type(exc).__name__}."],
            )

        # 5. Handle HTTP status codes
        if resp.status_code == 403:
            logger.warning("data.gov.in HTTP 403 Forbidden | duration: %.2fs", duration)
            return CrimeStatsResponse(
                endpoint=self.endpoint,
                resource_id=self.resource_id,
                status="error",
                limit=limit,
                offset=offset,
                limitations=self._standard_limitations(),
                notes=["Access forbidden (HTTP 403). The provided API key or resource may be unauthorized."],
            )

        if resp.status_code == 404:
            logger.warning("data.gov.in HTTP 404 Not Found | duration: %.2fs", duration)
            return CrimeStatsResponse(
                endpoint=self.endpoint,
                resource_id=self.resource_id,
                status="unavailable",
                limit=limit,
                offset=offset,
                limitations=self._standard_limitations(),
                notes=[f"Resource ID '{self.resource_id}' was not found on data.gov.in (HTTP 404)."],
            )

        if resp.status_code != 200:
            logger.warning("data.gov.in HTTP %d error | duration: %.2fs", resp.status_code, duration)
            return CrimeStatsResponse(
                endpoint=self.endpoint,
                resource_id=self.resource_id,
                status="error",
                limit=limit,
                offset=offset,
                limitations=self._standard_limitations(),
                notes=[f"Upstream data.gov.in error (HTTP {resp.status_code})."],
            )

        # 6. Parse JSON Payload
        try:
            data = resp.json()
        except Exception as exc:
            logger.warning("data.gov.in JSON decode error: %s", exc)
            return CrimeStatsResponse(
                endpoint=self.endpoint,
                resource_id=self.resource_id,
                status="error",
                limit=limit,
                offset=offset,
                limitations=self._standard_limitations(),
                notes=["Could not parse JSON response from data.gov.in."],
            )

        raw_records = data.get("records", [])
        total = data.get("total", len(raw_records))
        reporting_period = data.get("period") or data.get("year") or (str(year) if year else None)

        parsed_records: list[CrimeRecord] = []
        for r in raw_records:
            if not isinstance(r, dict):
                continue

            # Safely extract common field variants without guessing
            state_val = (
                r.get("State")
                or r.get("state")
                or r.get("State/UT")
                or r.get("state_ut")
                or r.get("state_name")
            )
            district_val = (
                r.get("District")
                or r.get("district")
                or r.get("City")
                or r.get("city")
                or r.get("Metropolitan_City")
                or r.get("metro")
            )
            year_val = r.get("Year") or r.get("year")
            head_val = (
                r.get("Crime Head")
                or r.get("crime_head")
                or r.get("Offence")
                or r.get("offence")
                or r.get("Category")
            )

            # Extract numeric cases registered safely
            cases_raw = (
                r.get("Cases Reported")
                or r.get("cases_reported")
                or r.get("Cases Registered")
                or r.get("cases_registered")
                or r.get("Total Cases")
                or r.get("total_cases")
            )
            cases_int: Optional[int] = None
            if cases_raw is not None:
                try:
                    cases_int = int(str(cases_raw).replace(",", "").strip())
                except (ValueError, TypeError):
                    cases_int = None

            parsed_records.append(
                CrimeRecord(
                    state_ut=str(state_val) if state_val is not None else None,
                    district_or_city=str(district_val) if district_val is not None else None,
                    year=str(year_val) if year_val is not None else None,
                    crime_head=str(head_val) if head_val is not None else None,
                    cases_registered=cases_int,
                    raw_fields=r,
                )
            )

        retrieved_iso = datetime.now(timezone.utc).isoformat()
        result = CrimeStatsResponse(
            source="Open Government Data (OGD) Platform India (data.gov.in) / NCRB",
            attribution="Ministry of Home Affairs / National Crime Records Bureau (NCRB)",
            endpoint=self.endpoint,
            resource_id=self.resource_id,
            retrieved_at=retrieved_iso,
            status="available",
            reporting_period=str(reporting_period) if reporting_period else None,
            geographic_level="State/UT / Metropolitan District",
            total_records=total,
            limit=limit,
            offset=offset,
            records=parsed_records,
            limitations=self._standard_limitations(),
            notes=["Official reported statistics from data.gov.in DataStore API."],
        )

        # Cache valid successful response
        self.cache.set(cache_key, result)
        return result
