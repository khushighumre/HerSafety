"""
Pydantic schemas for NightWise API.

Only the health endpoint and the core data shapes needed for future
feature endpoints are defined here. Feature request/response schemas
will be added when those routers are implemented.
"""

from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    version: str = "0.1.0"


from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

VALID_TRAVEL_MODES = {"walk", "bike", "car"}
VALID_JOURNEY_STATUSES = {"planned", "active", "completed", "cancelled"}


# ---------------------------------------------------------------------------
# Journey
# ---------------------------------------------------------------------------

class JourneyCreate(BaseModel):
    user_label: str = Field("demo-user", description="Identifier for demo user")
    origin: Optional[str] = Field(None, description="Origin location name or coordinates")
    destination: Optional[str] = Field(None, description="Destination location name or coordinates")
    origin_name: Optional[str] = Field(None, description="Alias for origin")
    destination_name: Optional[str] = Field(None, description="Alias for destination")
    travel_mode: Optional[str] = Field(None, description="Travel mode: walk, bike, or car")
    transport_mode: Optional[str] = Field(None, description="Alias for travel_mode")
    origin_lat: Optional[float] = None
    origin_lng: Optional[float] = None
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    planned_departure_time: Optional[datetime] = Field(None, description="Optional planned departure time")
    status: str = Field("planned", description="Initial journey status: planned, active, completed, cancelled")
    started_at: Optional[datetime] = Field(None, description="Optional start timestamp. Defaults to now if status is active.")

    @model_validator(mode="after")
    def validate_journey(self) -> "JourneyCreate":
        # Resolve origin
        orig = (self.origin or self.origin_name or "").strip()
        if not orig:
            raise ValueError("Origin is required and cannot be empty.")
        self.origin = orig
        self.origin_name = orig

        # Resolve destination
        dest = (self.destination or self.destination_name or "").strip()
        if not dest:
            raise ValueError("Destination is required and cannot be empty.")
        self.destination = dest
        self.destination_name = dest

        # Resolve travel_mode
        mode = (self.travel_mode or self.transport_mode or "walk").strip().lower()
        if mode not in VALID_TRAVEL_MODES:
            raise ValueError(f"Invalid travel mode '{mode}'. Must be one of: {', '.join(sorted(VALID_TRAVEL_MODES))}.")
        self.travel_mode = mode
        self.transport_mode = mode

        # Resolve status
        st = (self.status or "planned").strip().lower()
        if st not in VALID_JOURNEY_STATUSES:
            raise ValueError(f"Invalid status '{st}'. Must be one of: {', '.join(sorted(VALID_JOURNEY_STATUSES))}.")
        self.status = st

        return self


class JourneyUpdate(BaseModel):
    status: Optional[str] = Field(None, description="Updated status: planned, active, completed, cancelled")
    started_at: Optional[datetime] = Field(None, description="Updated journey start timestamp")
    ended_at: Optional[datetime] = Field(None, description="Updated journey end timestamp")
    planned_departure_time: Optional[datetime] = Field(None, description="Updated planned departure time")

    @model_validator(mode="after")
    def validate_update(self) -> "JourneyUpdate":
        if self.status is not None:
            st = self.status.strip().lower()
            if st not in VALID_JOURNEY_STATUSES:
                raise ValueError(f"Invalid status '{st}'. Must be one of: {', '.join(sorted(VALID_JOURNEY_STATUSES))}.")
            self.status = st
        return self


class JourneyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_label: str = "demo-user"
    origin: str
    destination: str
    origin_name: str
    destination_name: str
    travel_mode: str
    transport_mode: str
    status: str
    origin_lat: Optional[float] = None
    origin_lng: Optional[float] = None
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    planned_departure_time: Optional[datetime] = None
    created_at: datetime
    started_at: datetime
    ended_at: Optional[datetime] = None

    @model_validator(mode="before")
    @classmethod
    def populate_fields(cls, data: Any) -> Any:
        if hasattr(data, "origin_name"):
            orig = getattr(data, "origin_name", "")
            dest = getattr(data, "destination_name", "")
            mode = getattr(data, "transport_mode", "walk")
            created = getattr(data, "created_at", None) or getattr(data, "started_at", None)
            planned = getattr(data, "planned_departure_at", None)
            started = getattr(data, "started_at", None) or created
            return {
                "id": getattr(data, "id"),
                "user_label": getattr(data, "user_label", "demo-user"),
                "origin": orig,
                "destination": dest,
                "origin_name": orig,
                "destination_name": dest,
                "travel_mode": mode,
                "transport_mode": mode,
                "status": getattr(data, "status", "planned"),
                "origin_lat": getattr(data, "origin_lat", None),
                "origin_lng": getattr(data, "origin_lng", None),
                "destination_lat": getattr(data, "destination_lat", None),
                "destination_lng": getattr(data, "destination_lng", None),
                "planned_departure_time": planned,
                "created_at": created,
                "started_at": started,
                "ended_at": getattr(data, "ended_at", None),
            }
        elif isinstance(data, dict):
            orig = data.get("origin") or data.get("origin_name", "")
            dest = data.get("destination") or data.get("destination_name", "")
            mode = data.get("travel_mode") or data.get("transport_mode", "walk")
            created = data.get("created_at") or data.get("started_at")
            planned = data.get("planned_departure_time") or data.get("planned_departure_at")
            data["origin"] = orig
            data["origin_name"] = orig
            data["destination"] = dest
            data["destination_name"] = dest
            data["travel_mode"] = mode
            data["transport_mode"] = mode
            data["created_at"] = created
            data["started_at"] = data.get("started_at") or created
            data["planned_departure_time"] = planned
        return data


# ---------------------------------------------------------------------------
# CheckIn
# ---------------------------------------------------------------------------

class CheckInCreate(BaseModel):
    status: str = "confirmed"
    lat: Optional[float] = None
    lng: Optional[float] = None
    note: Optional[str] = None


class CheckInRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    journey_id: int
    status: str = "confirmed"
    created_at: datetime
    responded_at: datetime
    checked_at: datetime
    lat: Optional[float] = None
    lng: Optional[float] = None
    note: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_fields(cls, data: Any) -> Any:
        if hasattr(data, "id"):
            checked = getattr(data, "checked_at", None) or getattr(data, "created_at", None) or datetime.now(timezone.utc)
            created = getattr(data, "created_at", None) or checked
            responded = getattr(data, "responded_at", None) or checked
            return {
                "id": getattr(data, "id"),
                "journey_id": getattr(data, "journey_id"),
                "status": getattr(data, "status", "confirmed") or "confirmed",
                "created_at": created,
                "responded_at": responded,
                "checked_at": checked,
                "lat": getattr(data, "lat", None),
                "lng": getattr(data, "lng", None),
                "note": getattr(data, "note", None),
            }
        elif isinstance(data, dict):
            checked = data.get("checked_at") or data.get("created_at") or datetime.now(timezone.utc)
            created = data.get("created_at") or checked
            responded = data.get("responded_at") or checked
            data["checked_at"] = checked
            data["created_at"] = created
            data["responded_at"] = responded
            if "status" not in data or not data["status"]:
                data["status"] = "confirmed"
        return data


class CheckInStatusRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    journey_id: int
    journey_status: str
    is_overdue: bool
    checkin_required: bool
    last_checkin_at: Optional[datetime] = None
    next_checkin_due_at: Optional[datetime] = None
    seconds_overdue: int = 0
    seconds_remaining: Optional[int] = 0
    checkin_interval_seconds: int = 90
    status_label: str = "up_to_date"


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


class EvidenceVerifyResult(BaseModel):
    evidence_id: int
    stored_sha256: str
    computed_sha256: str
    match: bool
