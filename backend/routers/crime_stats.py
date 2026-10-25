"""
backend/routers/crime_stats.py

FastAPI router for official National Crime Records Bureau (NCRB) / data.gov.in
crime statistics.

IMPORTANT PRINCIPLES:
- Macro police statistics are provided for institutional and civic context only.
- They are NOT converted to street-level safety scores or substituted into routing algorithms.
- NightWise demo Night Activity Scores remain separate.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from crime_stats_provider import CrimeStatsResponse, DataGovInCrimeProvider

logger = logging.getLogger("nightwise.crime_stats_router")
router = APIRouter(tags=["Crime Statistics"])


def get_crime_provider() -> DataGovInCrimeProvider:
    """Dependency provider for DataGovInCrimeProvider, enabling override in tests."""
    return DataGovInCrimeProvider()


@router.get(
    "/crime-stats",
    response_model=CrimeStatsResponse,
    summary="Get official NCRB / data.gov.in crime statistics",
    description=(
        "Retrieves reported crime against women statistics from data.gov.in. "
        "Provides official reporting period, source attribution, and usage limitations. "
        "These state/metro level statistics are NOT converted into street-level safety scores."
    ),
)
def get_crime_statistics(
    offset: int = Query(0, ge=0, description="Record offset for pagination"),
    limit: int = Query(20, ge=1, le=100, description="Number of records to return"),
    state: Optional[str] = Query(None, description="Filter by State or Union Territory name"),
    year: Optional[str] = Query(None, description="Filter by reporting year"),
    provider: DataGovInCrimeProvider = Depends(get_crime_provider),
) -> CrimeStatsResponse:
    return provider.get_crime_statistics(
        offset=offset,
        limit=limit,
        state=state,
        year=year,
    )
