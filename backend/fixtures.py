"""
backend/fixtures.py

Deterministic demo fixture data for the NightWise route-comparison API.

IMPORTANT — DATA DISCLAIMER:
  All values in this file are clearly-labelled demo data created for a
  hackathon prototype. Nothing here represents verified real-world safety
  information. Signal scores (lighting, activity, CCTV, etc.) are
  illustrative estimates, not measurements. Do not rely on them for
  real travel decisions.

Location identifiers match the frontend DEMO_LOCATIONS names exactly so
that the backend and frontend share a single source of truth for place
names and coordinates.
"""

from __future__ import annotations
from typing import Optional

# ---------------------------------------------------------------------------
# Locations  (name → {lat, lng})
# Names match src/data/mock.ts DEMO_LOCATIONS exactly.
# ---------------------------------------------------------------------------

LOCATIONS: dict[str, dict] = {
    "MG Road Metro":          {"lat": 12.9756, "lng": 77.6068},
    "Indiranagar 100ft Rd":   {"lat": 12.9719, "lng": 77.6412},
    "Koramangala 5th Block":  {"lat": 12.9345, "lng": 77.6220},
    "HSR Layout Sector 2":    {"lat": 12.9121, "lng": 77.6446},
    "Cubbon Park":            {"lat": 12.9763, "lng": 77.5929},
    "Majestic Bus Stand":     {"lat": 12.9774, "lng": 77.5726},
    "Jayanagar 4th Block":    {"lat": 12.9250, "lng": 77.5938},
    "Whitefield ITPL":        {"lat": 12.9857, "lng": 77.7368},
}

VALID_MODES = {"walk", "car", "bike"}

# ---------------------------------------------------------------------------
# Signal weights (must sum to 1.0)
# ---------------------------------------------------------------------------

SIGNAL_WEIGHTS: dict[str, float] = {
    "lighting":        0.25,
    "activity":        0.20,
    "main_road":       0.15,
    "transport_help":  0.15,
    "cctv":            0.10,
    "gap_penalty":     0.15,   # applied as a deduction, not a positive signal
}

# ---------------------------------------------------------------------------
# Route path fixtures
#
# Each entry defines one candidate path between a specific origin/destination
# pair. Paths are identified by a stable key used internally.
#
# coords: [[lat, lng], ...] — matches Leaflet [lat, lng] convention.
#
# Signal scores (0–100, higher = safer):
#   None  → signal data not available for this path; excluded from average.
#   int   → demo estimate, clearly labelled.
#
# gap_km: length of the longest low-activity segment in km (0 = none known).
# gap_note: human-readable description of the gap.
#
# freshness_hours: age of the most recent underlying demo data point.
# data_coverage_pct: percentage of the path length with any signal data.
#
# distance_km / duration_walk_min: base walking figures.
# Duration for car/bike is derived with a mode multiplier (see scoring.py).
# Durations are labelled as demo estimates — no real routing is used.
# ---------------------------------------------------------------------------

# Shared waypoints for MG Road ↔ Koramangala paths
_A = [12.9756, 77.6068]   # MG Road Metro
_B = [12.9352, 77.6245]   # Koramangala 5th Block (approx centroid)

ROUTE_PATHS: dict[str, dict] = {

    # -----------------------------------------------------------------------
    # MG Road Metro → Koramangala 5th Block
    # Three distinct illustrative paths; geometry preserved from frontend.
    # -----------------------------------------------------------------------

    "mgroad_koramangala_direct": {
        "origin":      "MG Road Metro",
        "destination": "Koramangala 5th Block",
        "label":       "Fastest",
        "distance_km": 8.4,
        "duration_walk_min": 22,
        "coords": [
            _A,
            [12.968, 77.616],
            [12.955, 77.621],
            [12.944, 77.623],
            _B,
        ],
        # Demo signal scores — not verified real-world data
        "signals": {
            "lighting":       52,   # demo: partial street lighting on direct route
            "activity":       38,   # demo: low foot traffic after 10 PM
            "main_road":      70,   # demo: mostly main roads
            "transport_help": 60,   # demo: bus stops present but infrequent
            "cctv":           None, # demo: no CCTV data available for this path
        },
        "gap_km":   1.2,
        "gap_note": "1.2 km stretch with no community reports in the last 30 days",
        "gap_from": "11:40 PM",
        "gap_to":   "1:15 AM",
        "freshness_hours":    5,
        "data_coverage_pct":  88,
        "notes": [
            "Quickest path, but passes two stretches with low foot traffic after 11 PM.",
            "1.2 km runs through an area with no community reports in the last 30 days (limited data).",
            "DEMO DATA — scores are illustrative estimates, not verified safety measurements.",
        ],
    },

    "mgroad_koramangala_balanced": {
        "origin":      "MG Road Metro",
        "destination": "Koramangala 5th Block",
        "label":       "Balanced",
        "distance_km": 9.1,
        "duration_walk_min": 26,
        "coords": [
            _A,
            [12.970, 77.612],
            [12.960, 77.619],
            [12.948, 77.627],
            [12.940, 77.626],
            _B,
        ],
        # Demo signal scores — not verified real-world data
        "signals": {
            "lighting":       72,   # demo: well-lit main roads on this detour
            "activity":       68,   # demo: consistent evening activity
            "main_road":      80,   # demo: stays on main roads throughout
            "transport_help": 75,   # demo: multiple bus stops and auto stands
            "cctv":           55,   # demo: partial CCTV coverage at junctions
        },
        "gap_km":   0.0,
        "gap_note": "",
        "gap_from": "",
        "gap_to":   "",
        "freshness_hours":    2,
        "data_coverage_pct":  94,
        "notes": [
            "Small detour to stay on well-lit main roads with consistent evening activity.",
            "Strong demo data coverage from community reports in the last 7 days.",
            "DEMO DATA — scores are illustrative estimates, not verified safety measurements.",
        ],
    },

    "mgroad_koramangala_safest": {
        "origin":      "MG Road Metro",
        "destination": "Koramangala 5th Block",
        "label":       "Safest (Limited Data)",
        "distance_km": 10.6,
        "duration_walk_min": 31,
        "coords": [
            _A,
            [12.974, 77.600],
            [12.966, 77.594],
            [12.952, 77.598],
            [12.938, 77.607],
            [12.933, 77.617],
            _B,
        ],
        # Demo signal scores — not verified real-world data
        "signals": {
            "lighting":       80,   # demo: avoids known dark stretches
            "activity":       None, # demo: no activity data for 3.1 km section
            "main_road":      65,   # demo: some service roads included
            "transport_help": 70,   # demo: passes major transport nodes
            "cctv":           None, # demo: no CCTV data for this path
        },
        "gap_km":   3.1,
        "gap_note": "3.1 km with no recent community reports — treat score as indicative only",
        "gap_from": "12:00 AM",
        "gap_to":   "5:30 AM",
        "freshness_hours":    14,
        "data_coverage_pct":  61,
        "notes": [
            "Avoids every flagged stretch in the demo dataset, but 3.1 km has no recent "
            "community reports — treat the score as indicative only.",
            "Data freshness is low; verify conditions before relying on this route late at night.",
            "Two signals (activity, CCTV) are unknown for this path; score is renormalized "
            "over available signals only, which reduces confidence.",
            "DEMO DATA — scores are illustrative estimates, not verified safety measurements.",
        ],
    },
}

# ---------------------------------------------------------------------------
# Mode speed multipliers for demo duration estimates.
# Applied to the base walking duration.
# Clearly labelled as demo estimates — no real routing is used.
# ---------------------------------------------------------------------------

MODE_DURATION_MULTIPLIER: dict[str, float] = {
    "walk": 1.0,
    "bike": 0.40,   # ~2.5× faster than walking
    "car":  0.25,   # ~4× faster than walking (includes traffic estimate)
}

# ---------------------------------------------------------------------------
# Coordinate validity bounds (generous bounds covering Bengaluru metro area)
# ---------------------------------------------------------------------------

LAT_MIN, LAT_MAX = 12.7, 13.2
LNG_MIN, LNG_MAX = 77.4, 77.9
