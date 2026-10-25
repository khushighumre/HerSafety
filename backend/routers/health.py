from fastapi import APIRouter
from schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness check. Returns status ok. Does not expose secrets or paths."""
    return HealthResponse(status="ok")
