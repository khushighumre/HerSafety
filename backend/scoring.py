"""
backend/scoring.py

Deterministic night-safety scoring for NightWise route candidates.

IMPORTANT — SCORING DISCLAIMER:
  All scores are computed from clearly-labelled demo fixture data.
  They are illustrative heuristics, not verified safety predictions
  and are not AI-generated. Unknown signals are excluded from the
  weighted average (renormalized), not treated as zero.

Scoring formula
---------------
1. For each known signal s_i with weight w_i and score v_i (0–100):
       raw_score = Σ(w_i * v_i) / Σ(w_i)   [over known signals only]

2. Gap penalty:
       penalty = min(gap_km * GAP_PENALTY_PER_KM, MAX_GAP_PENALTY)
   The penalty is applied to the raw_score:
       adjusted_score = raw_score * (1 - penalty)

3. Final night_score = round(adjusted_score), clamped to [0, 100].

Gap penalty constants
---------------------
  GAP_PENALTY_PER_KM = 0.05  → each km of low-activity gap reduces the
                                score by 5 percentage points of the raw score.
  MAX_GAP_PENALTY    = 0.30  → cap at 30% reduction regardless of gap length.

Confidence derivation
---------------------
  known_signal_count / total_signal_count → signal_completeness
  data_coverage_pct / 100                 → coverage_ratio
  combined = 0.6 * signal_completeness + 0.4 * coverage_ratio

  combined >= 0.75 → "high"
  combined >= 0.45 → "medium"
  else             → "low"
"""

from __future__ import annotations
from typing import Optional

from fixtures import SIGNAL_WEIGHTS, MODE_DURATION_MULTIPLIER

# ---------------------------------------------------------------------------
# Gap penalty constants (documented in module docstring)
# ---------------------------------------------------------------------------

GAP_PENALTY_PER_KM: float = 0.05
MAX_GAP_PENALTY: float = 0.30

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_night_score(
    signals: dict[str, Optional[int]],
    gap_km: float,
) -> tuple[int, dict, float]:
    """
    Compute the night safety score for one route path.

    Parameters
    ----------
    signals : dict mapping signal name → score (0–100) or None (unknown)
    gap_km  : length of the longest low-activity gap in km

    Returns
    -------
    night_score   : int, 0–100
    breakdown     : dict with per-signal score, weight, and known flag
    gap_penalty   : float, the fractional penalty applied (0.0–MAX_GAP_PENALTY)
    """
    # Exclude gap_penalty from the signal weights dict — it is applied separately.
    signal_names = [k for k in SIGNAL_WEIGHTS if k != "gap_penalty"]

    known_weighted_sum = 0.0
    known_weight_sum = 0.0
    breakdown: dict[str, dict] = {}

    for name in signal_names:
        weight = SIGNAL_WEIGHTS[name]
        value = signals.get(name)
        known = value is not None
        breakdown[name] = {
            "score": value,
            "weight": weight,
            "known": known,
        }
        if known:
            known_weighted_sum += weight * value  # type: ignore[operator]
            known_weight_sum += weight

    # Renormalize over known signals only.
    if known_weight_sum == 0.0:
        raw_score = 0.0
    else:
        raw_score = known_weighted_sum / known_weight_sum

    # Gap penalty: each km of low-activity gap reduces score by GAP_PENALTY_PER_KM,
    # capped at MAX_GAP_PENALTY.
    gap_penalty = min(gap_km * GAP_PENALTY_PER_KM, MAX_GAP_PENALTY)
    adjusted = raw_score * (1.0 - gap_penalty)

    night_score = max(0, min(100, round(adjusted)))
    return night_score, breakdown, gap_penalty


def compute_confidence(
    signals: dict[str, Optional[int]],
    data_coverage_pct: int,
) -> str:
    """
    Derive confidence level from signal completeness and data coverage.

    Returns "high", "medium", or "low".
    """
    signal_names = [k for k in SIGNAL_WEIGHTS if k != "gap_penalty"]
    total = len(signal_names)
    known = sum(1 for n in signal_names if signals.get(n) is not None)

    signal_completeness = known / total if total > 0 else 0.0
    coverage_ratio = data_coverage_pct / 100.0

    combined = 0.6 * signal_completeness + 0.4 * coverage_ratio

    if combined >= 0.75:
        return "high"
    if combined >= 0.45:
        return "medium"
    return "low"


def estimate_duration(base_walk_min: int, mode: str) -> int:
    """
    Apply mode multiplier to the base walking duration.
    Returns an integer number of minutes.
    Result is a demo estimate — no real routing is used.
    """
    multiplier = MODE_DURATION_MULTIPLIER.get(mode, 1.0)
    return max(1, round(base_walk_min * multiplier))
