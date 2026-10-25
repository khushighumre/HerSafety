"""
backend/routers/routes.py

POST /api/v1/routes/compare

Returns three route alternatives (fastest, balanced, safest_available_data)
for a given origin/destination pair and travel mode.

IMPORTANT — DATA DISCLAIMER:
  All route scores and signal values are computed from clearly-labelled
  demo fixture data. They are illustrative heuristics, not verified
  real-world safety predictions and are not AI-generated.
  Do not rely on them for real travel decisions.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from fixtures import LOCATIONS, VALID_MODES, ROUTE_PATHS
from scoring import compute_night_score, compute_confidence, estimate_duration

router = APIRouter(prefix="/api/v1/routes", tags=["routes"])

# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

class RouteCompareRequest(BaseModel):
    origin: str = Field(..., description="Location name matching a known demo location")
    destination: str = Field(..., description="Location name matching a known demo location")
    mode: str = Field("walk", description="Travel mode: walk, car, or bike")
    maxDetourPct: int = Field(
        50,
        ge=0,
        le=200,
        description="Maximum acceptable detour percentage relative to the fastest route (0–200)",
    )

    @model_validator(mode="after")
    def validate_request(self) -> "RouteCompareRequest":
        if self.origin not in LOCATIONS:
            raise ValueError(
                f"Unknown origin '{self.origin}'. "
                f"Valid locations: {sorted(LOCATIONS.keys())}"
            )
        if self.destination not in LOCATIONS:
            raise ValueError(
                f"Unknown destination '{self.destination}'. "
                f"Valid locations: {sorted(LOCATIONS.keys())}"
            )
        if self.origin == self.destination:
            raise ValueError("origin and destination must be different locations")
        if self.mode not in VALID_MODES:
            raise ValueError(
                f"Unsupported mode '{self.mode}'. Valid modes: {sorted(VALID_MODES)}"
            )
        return self


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class SignalBreakdown(BaseModel):
    score: Optional[int]
    weight: float
    known: bool


class RouteGap(BaseModel):
    gap_km: float
    gap_from: str
    gap_to: str
    note: str


class RouteAlternative(BaseModel):
    id: str
    label: str
    distanceKm: float
    durationMin: int
    mode: str
    nightScore: int
    breakdown: dict[str, SignalBreakdown]
    confidence: str
    dataCoveragePct: int
    freshnessHours: int
    detourPct: float
    maxDetourPct: int
    gap: RouteGap
    notes: list[str]
    coords: list[list[float]]
    # Explicit disclaimer included in every response object
    disclaimer: str


class RouteCompareResponse(BaseModel):
    origin: str
    destination: str
    mode: str
    maxDetourPct: int
    fastest: RouteAlternative
    balanced: RouteAlternative
    safest_available_data: RouteAlternative
    disclaimer: str


# ---------------------------------------------------------------------------
# Coordinate validation helper
# ---------------------------------------------------------------------------

def _validate_coords(coords: list[list[float]], path_key: str) -> None:
    """Raise ValueError if any coordinate is outside plausible Bengaluru bounds."""
    from fixtures import LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX
    for i, pt in enumerate(coords):
        if len(pt) != 2:
            raise ValueError(f"Path '{path_key}' coord[{i}] must have exactly 2 elements")
        lat, lng = pt
        if not (LAT_MIN <= lat <= LAT_MAX):
            raise ValueError(
                f"Path '{path_key}' coord[{i}] lat={lat} outside [{LAT_MIN}, {LAT_MAX}]"
            )
        if not (LNG_MIN <= lng <= LNG_MAX):
            raise ValueError(
                f"Path '{path_key}' coord[{i}] lng={lng} outside [{LNG_MIN}, {LNG_MAX}]"
            )


# ---------------------------------------------------------------------------
# Core selection logic
# ---------------------------------------------------------------------------

def _build_alternative(
    route_id: str,
    path: dict,
    mode: str,
    detour_pct: float,
    max_detour_pct: int,
) -> RouteAlternative:
    """Score one path fixture and return a RouteAlternative."""
    night_score, breakdown, gap_penalty = compute_night_score(
        path["signals"], path["gap_km"]
    )
    confidence = compute_confidence(path["signals"], path["data_coverage_pct"])
    duration = estimate_duration(path["duration_walk_min"], mode)

    # Validate geometry
    _validate_coords(path["coords"], path.get("label", route_id))

    gap = RouteGap(
        gap_km=path["gap_km"],
        gap_from=path.get("gap_from", ""),
        gap_to=path.get("gap_to", ""),
        note=path.get("gap_note", ""),
    )

    # Build breakdown with typed objects
    typed_breakdown = {
        k: SignalBreakdown(
            score=v["score"],
            weight=v["weight"],
            known=v["known"],
        )
        for k, v in breakdown.items()
    }

    # Add gap penalty info to notes
    notes = list(path["notes"])
    if gap_penalty > 0:
        notes.append(
            f"Gap penalty applied: {gap_penalty:.0%} reduction to raw score "
            f"({path['gap_km']:.1f} km low-activity gap × 5 pp/km, "
            f"capped at 30%)."
        )
    if mode != "walk":
        notes.append(
            f"Duration ({duration} min) is a demo estimate using a "
            f"{mode} speed multiplier — no real routing API is used."
        )

    disclaimer = (
        "DEMO DATA: All scores are illustrative heuristics computed from "
        "hackathon fixture data. They are not verified real-world safety "
        "predictions and must not be used as the sole basis for travel decisions."
    )

    return RouteAlternative(
        id=route_id,
        label=path["label"],
        distanceKm=path["distance_km"],
        durationMin=duration,
        mode=mode,
        nightScore=night_score,
        breakdown=typed_breakdown,
        confidence=confidence,
        dataCoveragePct=path["data_coverage_pct"],
        freshnessHours=path["freshness_hours"],
        detourPct=round(detour_pct, 1),
        maxDetourPct=max_detour_pct,
        gap=gap,
        notes=notes,
        coords=path["coords"],
        disclaimer=disclaimer,
    )


def _select_routes(
    candidates: list[dict],
    mode: str,
    max_detour_pct: int,
) -> tuple[dict, dict, dict]:
    """
    Select fastest, balanced, and safest_available_data from candidates.

    fastest:               lowest estimated duration
    balanced:              minimises (duration_rank + safety_rank) composite
    safest_available_data: highest night_score among detour-eligible candidates

    Detour is calculated relative to the fastest candidate's duration.
    The detour cap is enforced server-side; candidates exceeding it are
    ineligible for balanced and safest roles.

    Returns (fastest_path, balanced_path, safest_path) dicts, each augmented
    with computed 'night_score' and 'detour_pct' keys.
    """
    if not candidates:
        raise HTTPException(
            status_code=404,
            detail="No route fixtures found for this origin/destination pair.",
        )

    # Score and estimate duration for all candidates
    scored = []
    for path in candidates:
        night_score, _, _ = compute_night_score(path["signals"], path["gap_km"])
        duration = estimate_duration(path["duration_walk_min"], mode)
        scored.append({**path, "_night_score": night_score, "_duration": duration})

    # Fastest = minimum duration
    fastest = min(scored, key=lambda p: p["_duration"])
    fastest_duration = fastest["_duration"]

    # Compute detour % for each candidate relative to fastest
    for p in scored:
        p["_detour_pct"] = (
            (p["_duration"] - fastest_duration) / fastest_duration * 100
            if fastest_duration > 0 else 0.0
        )

    # Fastest always has detour 0 — always eligible
    fastest["_detour_pct"] = 0.0

    # Detour-eligible candidates (fastest is always included)
    eligible = [p for p in scored if p["_detour_pct"] <= max_detour_pct]

    if len(eligible) < 1:
        eligible = [fastest]

    # Safest = highest night_score among eligible
    safest = max(eligible, key=lambda p: p["_night_score"])

    # Balanced = minimise composite rank (duration rank + safety rank)
    # Lower rank = better. Ties broken by higher safety score.
    n = len(eligible)
    duration_sorted = sorted(eligible, key=lambda p: p["_duration"])
    safety_sorted = sorted(eligible, key=lambda p: -p["_night_score"])

    def _composite(p: dict) -> tuple[int, int]:
        d_rank = duration_sorted.index(p)
        s_rank = safety_sorted.index(p)
        return (d_rank + s_rank, d_rank)  # secondary: prefer faster on tie

    balanced = min(eligible, key=_composite)

    return fastest, balanced, safest


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

DISCLAIMER = (
    "DEMO DATA: All route scores are illustrative heuristics computed from "
    "hackathon fixture data. They are not verified real-world safety predictions "
    "and must not be used as the sole basis for travel decisions."
)


@router.post("/compare", response_model=RouteCompareResponse)
def compare_routes(req: RouteCompareRequest) -> RouteCompareResponse:
    """
    Compare route alternatives for a given origin/destination and travel mode.

    Returns three alternatives: fastest, balanced, and safest_available_data.
    Scores are computed from demo fixture data only — not verified real-world data.
    """
    # Find all fixture paths matching this origin/destination pair
    candidates = [
        path for path in ROUTE_PATHS.values()
        if path["origin"] == req.origin and path["destination"] == req.destination
    ]

    if not candidates:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No route fixtures available for '{req.origin}' → '{req.destination}'. "
                "This is a demo backend with a limited fixture set. "
                f"Available pairs: MG Road Metro → Koramangala 5th Block."
            ),
        )

    fastest_path, balanced_path, safest_path = _select_routes(
        candidates, req.mode, req.maxDetourPct
    )

    fastest_alt = _build_alternative(
        "fastest", fastest_path, req.mode,
        fastest_path["_detour_pct"], req.maxDetourPct,
    )
    balanced_alt = _build_alternative(
        "balanced", balanced_path, req.mode,
        balanced_path["_detour_pct"], req.maxDetourPct,
    )
    safest_alt = _build_alternative(
        "safest_available_data", safest_path, req.mode,
        safest_path["_detour_pct"], req.maxDetourPct,
    )

    return RouteCompareResponse(
        origin=req.origin,
        destination=req.destination,
        mode=req.mode,
        maxDetourPct=req.maxDetourPct,
        fastest=fastest_alt,
        balanced=balanced_alt,
        safest_available_data=safest_alt,
        disclaimer=DISCLAIMER,
    )
