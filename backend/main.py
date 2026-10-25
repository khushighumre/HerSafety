"""
NightWise FastAPI backend — hackathon prototype.

IMPORTANT: This backend does NOT contact real emergency services.
All SOS and journey-sharing flows are clearly simulated.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
# Import all models so SQLAlchemy registers their tables before create_all.
import models  # noqa: F401
from routers import health as health_router
from routers import routes as routes_router


# ---------------------------------------------------------------------------
# CORS origins
# ---------------------------------------------------------------------------

# Origins that are always allowed regardless of the env var.
# Covers both the default Lovable/TanStack Start port (8080) and the port
# reported in the CORS preflight failure (8081), in both localhost and
# 127.0.0.1 forms so the browser's choice of hostname never matters.
_BUILTIN_ORIGINS = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
]


def _cors_origins() -> list[str]:
    """
    Build the allowed-origins list.

    Starts from _BUILTIN_ORIGINS, then merges any additional origins from the
    BACKEND_CORS_ORIGINS env var (comma-separated).  The env var is additive —
    it does not replace the built-in list.
    Set BACKEND_CORS_ORIGINS in backend/.env to add deployed preview URLs.
    """
    extra_raw = os.getenv("BACKEND_CORS_ORIGINS", "")
    extra = [o.strip() for o in extra_raw.split(",") if o.strip()]
    # Preserve insertion order, deduplicate.
    seen: dict[str, None] = {}
    for o in _BUILTIN_ORIGINS + extra:
        seen[o] = None
    return list(seen)


# ---------------------------------------------------------------------------
# Lifespan: create tables on startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="NightWise API",
    description=(
        "Backend for the NightWise women's night-travel safety platform. "
        "Hackathon prototype — no real emergency services are contacted."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)

# Root health check (no prefix) + versioned alias under /api/v1
app.include_router(health_router.router)
app.include_router(health_router.router, prefix="/api/v1")

# Routes API
app.include_router(routes_router.router)
