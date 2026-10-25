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

def _cors_origins() -> list[str]:
    """
    Read allowed origins from BACKEND_CORS_ORIGINS env var (comma-separated).
    Falls back to the Lovable/TanStack Start default dev port (8080).
    Set BACKEND_CORS_ORIGINS in a .env file or your shell to override.
    """
    raw = os.getenv("BACKEND_CORS_ORIGINS", "http://localhost:8080")
    return [o.strip() for o in raw.split(",") if o.strip()]


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
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Accept"],
)

# Root health check (no prefix) + versioned alias under /api/v1
app.include_router(health_router.router)
app.include_router(health_router.router, prefix="/api/v1")

# Routes API
app.include_router(routes_router.router)
