"""
backend/routers/safety_data.py

FastAPI router for synthetic / demo safety signals in NightWise Phase 1.

IMPORTANT TRUST & SCORING PRINCIPLES:
- All records served by this endpoint are strictly SYNTHETIC DEMO SAMPLES.
- They are NOT verified ground truth, actual crime incidents, or confirmed physical facilities.
- They must NEVER be used to inflate, fabricate, or silently modify live routing safety scores.
- This dataset requires NO API key and runs entirely locally.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

logger = logging.getLogger("nightwise.safety_data_router")
router = APIRouter(tags=["Safety Data"])

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "demo_safety_data.json"

DEFAULT_DISCLAIMER = (
    "DEMO DATA — NOT VERIFIED. All records in this dataset are synthetic, "
    "hardcoded demonstration samples for NightWise UI evaluation. "
    "They do NOT represent verified facilities, real crime reports, or active field observations."
)


class DemoSafetyRecord(BaseModel):
    id: str = Field(..., description="Unique synthetic record identifier")
    location: str = Field(..., description="Simulated location or corridor description")
    latitude: float = Field(..., description="Geographic latitude coordinate")
    longitude: float = Field(..., description="Geographic longitude coordinate")
    signal_type: str = Field(..., description="Category: public_transport, assistance_point, lighting, cctv, community_safety_report")
    description: str = Field(..., description="Synthetic signal description")
    source: str = Field(..., description="Data provenance label")
    status: str = Field(..., description="Record status (e.g., simulated_demo)")
    is_demo: bool = Field(True, description="Always true for synthetic records")


class SafetyDataResponse(BaseModel):
    records: List[DemoSafetyRecord] = Field(default_factory=list, description="List of safety records matching filter")
    total: int = Field(0, description="Total number of records returned")
    signal_type: Optional[str] = Field(None, description="Signal type filter applied, if any")
    disclaimer: str = Field(DEFAULT_DISCLAIMER, description="Prominent disclaimer that data is synthetic and unverified")


def load_demo_records() -> List[dict]:
    """Load synthetic demo records from JSON file with graceful fallback."""
    if not DATA_PATH.exists():
        logger.warning(f"Synthetic safety dataset not found at {DATA_PATH}")
        return []

    try:
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "records" in data and isinstance(data["records"], list):
                return data["records"]
            return []
    except Exception as exc:
        logger.error(f"Failed to load synthetic safety data: {exc}")
        return []


def _normalize_signal_type(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    val = raw.strip().lower()
    if val in ("community_report", "community_reports", "community_safety_reports"):
        return "community_safety_report"
    return val


@router.get(
    "/safety-data",
    response_model=SafetyDataResponse,
    summary="Get synthetic Bengaluru safety signals dataset (Demo Data)",
    description=(
        "Returns synthetic safety signals for Bengaluru to demonstrate Phase 1 UI features "
        "without requiring external API keys. Records include public transport, assistance points, "
        "lighting, CCTV, and community safety reports. All records are clearly marked as demo data."
    ),
)
def get_safety_data(
    signal_type: Optional[str] = Query(
        None,
        description="Optional filter by signal_type (e.g. public_transport, assistance_point, lighting, cctv, community_safety_report)",
    ),
) -> SafetyDataResponse:
    raw_records = load_demo_records()
    normalized_filter = _normalize_signal_type(signal_type)

    if normalized_filter:
        filtered = [
            r for r in raw_records
            if _normalize_signal_type(r.get("signal_type")) == normalized_filter
        ]
    else:
        filtered = raw_records

    records: List[DemoSafetyRecord] = []
    for r in filtered:
        try:
            records.append(
                DemoSafetyRecord(
                    id=str(r.get("id", "")),
                    location=str(r.get("location", "")),
                    latitude=float(r.get("latitude", 0.0)),
                    longitude=float(r.get("longitude", 0.0)),
                    signal_type=str(r.get("signal_type", "")),
                    description=str(r.get("description", "")),
                    source=str(r.get("source", "NightWise Synthetic Demo Dataset (Not Verified)")),
                    status=str(r.get("status", "simulated_demo")),
                    is_demo=True,
                )
            )
        except Exception as exc:
            logger.debug(f"Skipping malformed record {r}: {exc}")
            continue

    return SafetyDataResponse(
        records=records,
        total=len(records),
        signal_type=signal_type,
        disclaimer=DEFAULT_DISCLAIMER,
    )
