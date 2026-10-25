"""
backend/routers/routes.py

POST /api/v1/routes/compare

Generates real route alternatives using the OpenRouteService provider
for any user-specified origin, destination, and travel mode.

IMPORTANT — DATA DISCLAIMER:
  Real route geometry, distance, and duration are retrieved from OpenRouteService.
  All safety scores and signals in Phase 1A are simulated demo heuristics,
  NOT verified real-world safety predictions. Do not rely on them for real travel decisions.
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from scoring import compute_night_score, compute_confidence
from routing_provider import OpenRouteServiceRoutingProvider, ProviderRoute
from osm_evidence_provider import (
    OpenStreetMapEvidenceProvider,
    GeographicEvidence,
    FeatureCounts,
    TagEvidenceSummary,
    is_point_near_polyline,
)
from routers.safety_data import load_demo_records

logger = logging.getLogger("nightwise.routes")
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/api/v1/routes", tags=["routes"])

VALID_MODES = {"walk", "car", "bike"}

# ---------------------------------------------------------------------------
# Dependency injection for routing provider & evidence provider
# ---------------------------------------------------------------------------

def get_routing_provider() -> OpenRouteServiceRoutingProvider:
    return OpenRouteServiceRoutingProvider()


def get_evidence_provider() -> OpenStreetMapEvidenceProvider:
    return OpenStreetMapEvidenceProvider()



# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

class RouteCompareRequest(BaseModel):
    origin: str = Field(..., description="Origin location name or 'lat, lng' coordinates")
    destination: str = Field(..., description="Destination location name or 'lat, lng' coordinates")
    mode: str = Field("walk", description="Travel mode: walk, car, or bike")
    maxDetourPct: int = Field(
        50,
        ge=0,
        le=200,
        description="Maximum acceptable detour percentage relative to the fastest route (0–200)",
    )

    @model_validator(mode="after")
    def validate_request(self) -> "RouteCompareRequest":
        self.origin = self.origin.strip()
        self.destination = self.destination.strip()
        if not self.origin:
            raise ValueError("origin cannot be empty")
        if not self.destination:
            raise ValueError("destination cannot be empty")
        if self.origin.lower() == self.destination.lower():
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


class DemoCategoryCounts(BaseModel):
    public_transport: int = 0
    assistance_points: int = 0
    lighting: int = 0
    cctv: int = 0
    community_safety_reports: int = 0
    total: int = 0


class DemoSafetyContext(BaseModel):
    source: str = "SYNTHETIC DEMO DATA — NOT VERIFIED"
    status: str = "simulated_demo"
    is_corridor_filtered: bool = True
    filter_description: str = "Corridor proximity (< 600m of route polyline)"
    counts: DemoCategoryCounts = Field(default_factory=DemoCategoryCounts)
    matched_record_ids: list[str] = Field(default_factory=list)
    disclaimer: str = (
        "DEMO DATA — NOT VERIFIED. All records and counts are synthetic demonstration samples. "
        "They do NOT represent verified physical facilities, real crime reports, or active field observations, "
        "and do NOT modify or verify route safety scores."
    )


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
    disclaimer: str
    evidence: Optional[GeographicEvidence] = None
    demo_context: Optional[DemoSafetyContext] = None


class RouteCompareResponse(BaseModel):
    origin: str
    destination: str
    mode: str
    maxDetourPct: int
    routes: list[RouteAlternative] = Field(
        default_factory=list,
        description="List of genuine route alternatives returned by the provider (1 to 3)",
    )
    fastest: Optional[RouteAlternative] = None
    balanced: Optional[RouteAlternative] = None
    safest_available_data: Optional[RouteAlternative] = None
    resolved_origin: Optional[str] = None
    resolved_destination: Optional[str] = None
    disclaimer: str


# ---------------------------------------------------------------------------
# Selection & building logic
# ---------------------------------------------------------------------------

DISCLAIMER = (
    "DEMO DATA: Routing geometry, distance, and duration are provided by OpenRouteService. "
    "Safety scores and signals are simulated heuristics for demonstration only — "
    "they are NOT verified real-world safety predictions and must not be used as the sole basis for travel decisions."
)

DEMO_HEURISTIC_PRESETS: dict[str, dict] = {
    "fastest": {
        "signals": {
            "lighting": 55,
            "activity": 42,
            "main_road": 75,
            "transport_help": 60,
            "cctv": None,
        },
        "gap_km": 1.0,
        "gap_note": "Simulated heuristic: passes potential lower foot-traffic stretch late at night",
        "data_coverage_pct": 85,
        "freshness_hours": 4,
    },
    "balanced": {
        "signals": {
            "lighting": 75,
            "activity": 68,
            "main_road": 80,
            "transport_help": 75,
            "cctv": 55,
        },
        "gap_km": 0.0,
        "gap_note": "",
        "data_coverage_pct": 92,
        "freshness_hours": 2,
    },
    "safest_available_data": {
        "signals": {
            "lighting": 82,
            "activity": None,
            "main_road": 65,
            "transport_help": 70,
            "cctv": None,
        },
        "gap_km": 2.5,
        "gap_note": "Simulated heuristic: segment with sparse reporting in demo dataset",
        "data_coverage_pct": 65,
        "freshness_hours": 12,
    },
}


def compute_demo_safety_context(coords: list[list[float]]) -> DemoSafetyContext:
    """
    Compute synthetic safety context for a route alternative using the existing
    demo_safety_data.json dataset.
    
    If corridor proximity finds records near the polyline (within 600m), counts
    those records specifically along the route. If none are near (e.g. route outside
    sample area), returns area-wide demo dataset totals explicitly labelled as area totals.
    """
    records = load_demo_records()
    if not records:
        return DemoSafetyContext(
            source="SYNTHETIC DEMO DATA — NOT VERIFIED",
            status="simulated_demo",
            is_corridor_filtered=False,
            filter_description="No synthetic demo records available",
            counts=DemoCategoryCounts(),
            matched_record_ids=[],
        )

    # 1. Attempt corridor proximity filtering (< 600 meters)
    corridor_matches = [
        r for r in records
        if is_point_near_polyline(
            float(r.get("latitude", 0.0)),
            float(r.get("longitude", 0.0)),
            coords,
            threshold_meters=600.0,
        )
    ]

    if corridor_matches:
        is_corridor = True
        desc = "Corridor proximity (< 600m of route polyline)"
        selected = corridor_matches
    else:
        is_corridor = False
        desc = "Bengaluru demo dataset totals (route corridor outside demo sample zone)"
        selected = records

    counts = DemoCategoryCounts()
    matched_ids: list[str] = []

    for r in selected:
        sig = str(r.get("signal_type", "")).strip().lower()
        matched_ids.append(str(r.get("id", "")))
        if sig == "public_transport":
            counts.public_transport += 1
        elif sig == "assistance_point":
            counts.assistance_points += 1
        elif sig == "lighting":
            counts.lighting += 1
        elif sig == "cctv":
            counts.cctv += 1
        elif sig in ("community_safety_report", "community_report"):
            counts.community_safety_reports += 1

    counts.total = (
        counts.public_transport
        + counts.assistance_points
        + counts.lighting
        + counts.cctv
        + counts.community_safety_reports
    )

    return DemoSafetyContext(
        source="SYNTHETIC DEMO DATA — NOT VERIFIED",
        status="simulated_demo",
        is_corridor_filtered=is_corridor,
        filter_description=desc,
        counts=counts,
        matched_record_ids=matched_ids,
    )


def _build_alternative(
    role_id: str,
    label: str,
    route: ProviderRoute,
    detour_pct: float,
    max_detour_pct: int,
    mode: str,
    evidence: Optional[GeographicEvidence] = None,
    demo_context: Optional[DemoSafetyContext] = None,
) -> RouteAlternative:
    """Combine live routing metrics from OpenRouteService with clearly marked simulated demo safety signals and real OSM evidence."""
    preset = DEMO_HEURISTIC_PRESETS.get(role_id, DEMO_HEURISTIC_PRESETS["fastest"])

    if demo_context is None:
        demo_context = compute_demo_safety_context(route.coords)

    night_score, breakdown, gap_penalty = compute_night_score(
        preset["signals"], preset["gap_km"]
    )
    confidence = compute_confidence(preset["signals"], preset["data_coverage_pct"])

    typed_breakdown = {
        k: SignalBreakdown(
            score=v["score"],
            weight=v["weight"],
            known=v["known"],
        )
        for k, v in breakdown.items()
    }

    gap = RouteGap(
        gap_km=preset["gap_km"],
        gap_from="11:30 PM" if preset["gap_km"] > 0 else "",
        gap_to="1:00 AM" if preset["gap_km"] > 0 else "",
        note=preset["gap_note"],
    )

    notes = [
        "Real route geometry, distance, and duration provided live by OpenRouteService.",
        "DEMO SAFETY DATA — Safety scores and signals are simulated heuristics for demonstration only, not verified real-world safety measurements.",
    ]
    if evidence is not None and evidence.status == "available":
        notes.append(
            f"OSM geographic context: {evidence.counts.transport_stops} transit stops, "
            f"{evidence.counts.assistance_amenities} assistance amenities, "
            f"{evidence.counts.street_lamps + evidence.counts.lit_path_segments} lighting items, "
            f"{evidence.counts.surveillance_points} CCTV mapped along corridor."
        )
    elif evidence is not None and evidence.status in ("unavailable", "error"):
        notes.append("OSM geographic context: Provider data currently unavailable or timed out.")
        notes.append(
            f"Synthetic demo context (NOT VERIFIED): {demo_context.counts.public_transport} transit stops, "
            f"{demo_context.counts.assistance_points} assistance points, "
            f"{demo_context.counts.lighting} lighting items, "
            f"{demo_context.counts.cctv} CCTV points, "
            f"{demo_context.counts.community_safety_reports} community reports."
        )

    if gap_penalty > 0:
        notes.append(
            f"Gap penalty applied: {gap_penalty:.0%} reduction to raw demo score."
        )

    return RouteAlternative(
        id=role_id,
        label=label,
        distanceKm=route.distance_km,
        durationMin=route.duration_min,
        mode=mode,
        nightScore=night_score,
        breakdown=typed_breakdown,
        confidence=confidence,
        dataCoveragePct=preset["data_coverage_pct"],
        freshnessHours=preset["freshness_hours"],
        detourPct=round(detour_pct, 1),
        maxDetourPct=max_detour_pct,
        gap=gap,
        notes=notes,
        coords=route.coords,
        disclaimer=DISCLAIMER,
        evidence=evidence,
        demo_context=demo_context,
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/compare", response_model=RouteCompareResponse)
def compare_routes(
    req: RouteCompareRequest,
    provider: OpenRouteServiceRoutingProvider = Depends(get_routing_provider),
    evidence_provider: OpenStreetMapEvidenceProvider = Depends(get_evidence_provider),
) -> RouteCompareResponse:
    """
    Compare route alternatives using OpenRouteService live routing.

    - Resolves place names to coordinates via provider geocoding, or parses user-supplied coordinates.
    - Generates real route geometry, distance, and duration from OpenRouteService.
    - Queries real OpenStreetMap geographic context for each returned route corridor.
    - Returns genuine alternatives respecting maxDetourPct without fabricating non-existent routes.
    - Preserves API contract with explicit demo safety score annotations.
    """
    logger.info(
        "Routing request received | provider: openrouteservice | mode: %s | maxDetourPct: %d",
        req.mode,
        req.maxDetourPct,
    )

    # 1. Geocode or parse origin and destination coordinates
    start_lat, start_lng, resolved_origin = provider.geocode(req.origin)
    end_lat, end_lng, resolved_destination = provider.geocode(req.destination)

    # Disallow identical resolved locations
    if abs(start_lat - end_lat) < 1e-5 and abs(start_lng - end_lng) < 1e-5:
        raise HTTPException(
            status_code=422,
            detail="Origin and destination resolved to the same coordinate location.",
        )

    # 2. Query routing provider for routes and alternatives
    raw_routes = provider.get_routes(
        start_lat=start_lat,
        start_lng=start_lng,
        end_lat=end_lat,
        end_lng=end_lng,
        mode=req.mode,
        max_detour_pct=req.maxDetourPct,
    )

    if not raw_routes:
        raise HTTPException(
            status_code=404,
            detail="No route found between the specified origin and destination.",
        )

    # 3. Identify fastest route and calculate detour percentage for alternatives
    fastest_cand = min(raw_routes, key=lambda r: r.duration_min)
    fastest_duration = fastest_cand.duration_min

    # Sort candidates by duration, ensuring fastest is first
    other_cands = [r for r in raw_routes if r is not fastest_cand]
    sorted_candidates = [fastest_cand] + sorted(other_cands, key=lambda r: r.duration_min)

    # Filter by maxDetourPct relative to fastest route
    eligible: list[tuple[ProviderRoute, float]] = []
    for cand in sorted_candidates:
        if cand is fastest_cand:
            eligible.append((cand, 0.0))
        else:
            detour_pct = (
                ((cand.duration_min - fastest_duration) / fastest_duration * 100.0)
                if fastest_duration > 0
                else 0.0
            )
            if detour_pct <= req.maxDetourPct:
                eligible.append((cand, detour_pct))

    # 4. Map eligible routes to genuine alternatives without fabrication or duplication
    routes: list[RouteAlternative] = []
    fastest_alt: Optional[RouteAlternative] = None
    balanced_alt: Optional[RouteAlternative] = None
    safest_alt: Optional[RouteAlternative] = None

    # Retrieve corridor evidence efficiently across all eligible alternatives
    # Queries the shared corridor envelope once, preventing duplicate requests and sequential timeouts
    eligible_coords = [cand.coords for cand, _ in eligible]
    if hasattr(evidence_provider, "get_multi_corridor_evidence"):
        evidence_list = evidence_provider.get_multi_corridor_evidence(eligible_coords)
    else:
        evidence_list = [evidence_provider.get_corridor_evidence(c) for c in eligible_coords]

    if len(eligible) == 1:
        ev0 = evidence_list[0] if len(evidence_list) > 0 else None
        fastest_alt = _build_alternative(
            "fastest", "Fastest", eligible[0][0], 0.0, req.maxDetourPct, req.mode, evidence=ev0
        )
        routes = [fastest_alt]
    elif len(eligible) == 2:
        ev0 = evidence_list[0] if len(evidence_list) > 0 else None
        ev1 = evidence_list[1] if len(evidence_list) > 1 else None
        fastest_alt = _build_alternative(
            "fastest", "Fastest", eligible[0][0], 0.0, req.maxDetourPct, req.mode, evidence=ev0
        )
        balanced_alt = _build_alternative(
            "balanced", "Balanced", eligible[1][0], eligible[1][1], req.maxDetourPct, req.mode, evidence=ev1
        )
        routes = [fastest_alt, balanced_alt]
    else:
        # 3 or more eligible routes
        ev0 = evidence_list[0] if len(evidence_list) > 0 else None
        ev1 = evidence_list[1] if len(evidence_list) > 1 else None
        ev2 = evidence_list[2] if len(evidence_list) > 2 else None
        fastest_alt = _build_alternative(
            "fastest", "Fastest", eligible[0][0], 0.0, req.maxDetourPct, req.mode, evidence=ev0
        )
        balanced_alt = _build_alternative(
            "balanced", "Balanced", eligible[1][0], eligible[1][1], req.maxDetourPct, req.mode, evidence=ev1
        )
        safest_alt = _build_alternative(
            "safest_available_data",
            "Safest (Limited Data)",
            eligible[2][0],
            eligible[2][1],
            req.maxDetourPct,
            req.mode,
            evidence=ev2,
        )
        routes = [fastest_alt, balanced_alt, safest_alt]


    logger.info(
        "Routing request completed | provider: openrouteservice | routes_returned: %d",
        len(routes),
    )

    return RouteCompareResponse(
        origin=req.origin,
        destination=req.destination,
        mode=req.mode,
        maxDetourPct=req.maxDetourPct,
        routes=routes,
        fastest=fastest_alt,
        balanced=balanced_alt,
        safest_available_data=safest_alt,
        resolved_origin=resolved_origin,
        resolved_destination=resolved_destination,
        disclaimer=DISCLAIMER,
    )
