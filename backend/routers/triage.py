"""
backend/routers/triage.py

Digital Safety Triage API:
- POST /api/v1/triage  — Deterministic rules-based threat assessment

Returns urgency/exposure scores, confidence, verdict, and recommended actions.
Does NOT persist raw descriptions. Does NOT use an AI/ML model.
"""

from fastapi import APIRouter, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from triage_engine import SUPPORTED_CATEGORIES, TriageResult, assess

router = APIRouter(prefix="/triage", tags=["Triage"])

_SORTED_CATEGORIES = sorted(SUPPORTED_CATEGORIES)


class TriageRequest(BaseModel):
    category: str = Field(..., description=f"One of: {', '.join(_SORTED_CATEGORIES)}")
    platform: str = Field(..., min_length=1, max_length=100, description="Platform or service involved")
    description: str = Field(..., min_length=1, max_length=2000, description="Description of the incident (max 2,000 characters)")

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        normalised = v.strip().lower()
        if normalised not in SUPPORTED_CATEGORIES:
            raise ValueError(
                f"Unsupported category '{v}'. Must be one of: {', '.join(_SORTED_CATEGORIES)}"
            )
        return normalised

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("platform cannot be blank")
        return stripped

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("description cannot be blank")
        return stripped


class TriageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category: str
    platform: str
    urgency_score: int
    exposure_score: int
    confidence: str
    verdict: str
    recommended_actions: list[str]
    method: str
    disclaimer: str


@router.post("", response_model=TriageResponse, status_code=status.HTTP_200_OK)
@router.post("/", response_model=TriageResponse, status_code=status.HTTP_200_OK, include_in_schema=False)
def triage(payload: TriageRequest) -> TriageResponse:
    """
    Run a deterministic rules-based threat assessment.

    - Accepts one of the five supported threat categories.
    - Returns urgency and exposure scores (0–100), confidence, verdict, and
      category-specific recommended actions.
    - method is always "rules"; no AI model is used.
    - Raw descriptions are never persisted or logged.
    - Scores are illustrative indicators, not validated risk probabilities.
    """
    result: TriageResult = assess(
        category=payload.category,
        platform=payload.platform,
        description=payload.description,
    )
    return TriageResponse(
        category=result.category,
        platform=result.platform,
        urgency_score=result.urgency_score,
        exposure_score=result.exposure_score,
        confidence=result.confidence,
        verdict=result.verdict,
        recommended_actions=result.recommended_actions,
        method=result.method,
        disclaimer=result.disclaimer,
    )
