"""
Pydantic schemas for NightWise API.

Only the health endpoint and the core data shapes needed for future
feature endpoints are defined here. Feature request/response schemas
will be added when those routers are implemented.
"""

from datetime import datetime
from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    version: str = "0.1.0"


# ---------------------------------------------------------------------------
# Journey
# ---------------------------------------------------------------------------

class JourneyBase(BaseModel):
    user_label: str = "demo-user"
    origin_name: str
    destination_name: str
    origin_lat: float | None = None
    origin_lng: float | None = None
    destination_lat: float | None = None
    destination_lng: float | None = None
    transport_mode: str = "walk"


class JourneyCreate(JourneyBase):
    pass


class JourneyRead(JourneyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    started_at: datetime
    ended_at: datetime | None = None


# ---------------------------------------------------------------------------
# CheckIn
# ---------------------------------------------------------------------------

class CheckInCreate(BaseModel):
    lat: float | None = None
    lng: float | None = None
    note: str | None = None


class CheckInRead(CheckInCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    journey_id: int
    checked_at: datetime


# ---------------------------------------------------------------------------
# SosAlert  — SIMULATED, no real emergency services are contacted
# ---------------------------------------------------------------------------

class SosAlertCreate(BaseModel):
    journey_id: int | None = None
    lat: float | None = None
    lng: float | None = None
    message: str | None = None


class SosAlertRead(SosAlertCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Always True in this prototype.
    is_simulated: bool
    triggered_at: datetime


# ---------------------------------------------------------------------------
# CommunityReport
# ---------------------------------------------------------------------------

class CommunityReportCreate(BaseModel):
    category: str
    title: str
    description: str | None = None
    area: str | None = None
    lat: float | None = None
    lng: float | None = None
    reporter_label: str = "anonymous"


class CommunityReportRead(CommunityReportCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    verifications: int
    reported_at: datetime


# ---------------------------------------------------------------------------
# Incident
# ---------------------------------------------------------------------------

class IncidentCreate(BaseModel):
    title: str
    category: str
    severity: str = "medium"
    summary: str | None = None
    user_label: str = "demo-user"


class IncidentRead(IncidentCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    status: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------

class EvidenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    incident_id: int
    original_filename: str
    file_type: str
    size_bytes: int
    sha256: str
    hash_verified: bool
    added_at: datetime
