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
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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

VALID_COMMUNITY_CATEGORIES = {
    "poor-lighting": "poor-lighting",
    "poor_lighting": "poor-lighting",
    "poor lighting": "poor-lighting",
    "lighting": "poor-lighting",
    "unsafe-area": "unsafe-area",
    "unsafe_area": "unsafe-area",
    "unsafe area": "unsafe-area",
    "feels-unsafe": "unsafe-area",
    "feels unsafe": "unsafe-area",
    "harassment": "harassment",
    "street-harassment": "harassment",
    "street harassment": "harassment",
    "suspicious-activity": "suspicious-activity",
    "suspicious_activity": "suspicious-activity",
    "suspicious activity": "suspicious-activity",
    "stalking": "suspicious-activity",
    "being followed": "suspicious-activity",
    "transport": "transport",
    "transport-issue": "transport",
    "transport_issue": "transport",
    "transport issue": "transport",
    "transport concern": "transport",
    "other": "other",
}


class CommunityReportCreate(BaseModel):
    category: str = Field(..., description="Report category (e.g. poor-lighting, unsafe-area, harassment, suspicious-activity, transport, other)")
    description: str = Field(..., description="Detailed description of the safety observation (5-2000 chars)")
    title: Optional[str] = Field(None, description="Optional brief title (min 3 chars if provided)")
    area: Optional[str] = Field(None, description="Optional location or neighbourhood name")
    location_label: Optional[str] = Field(None, description="Alias for area")
    lat: Optional[float] = Field(None, description="Optional latitude coordinate (-90 to 90)")
    lng: Optional[float] = Field(None, description="Optional longitude coordinate (-180 to 180)")
    reporter_label: str = Field("anonymous", description="Reporter display label (default anonymous)")

    @model_validator(mode="after")
    def validate_report(self) -> "CommunityReportCreate":
        # Validate category
        raw_cat = (self.category or "").strip().lower()
        if not raw_cat or raw_cat not in VALID_COMMUNITY_CATEGORIES:
            valid_cats = "poor-lighting, unsafe-area, harassment, suspicious-activity, transport, other"
            raise ValueError(f"Invalid category '{self.category}'. Must be one of: {valid_cats}.")
        self.category = VALID_COMMUNITY_CATEGORIES[raw_cat]

        # Validate description
        desc = (self.description or "").strip()
        if not desc:
            raise ValueError("Description is required and cannot be empty.")
        if len(desc) < 5:
            raise ValueError("Description must be at least 5 characters long.")
        if len(desc) > 2000:
            raise ValueError("Description cannot exceed 2000 characters.")
        self.description = desc

        # Validate area / location_label
        loc = (self.area or self.location_label or "").strip()
        self.area = loc if loc else None
        self.location_label = self.area

        # Validate title
        raw_title = (self.title or "").strip()
        if raw_title:
            if len(raw_title) < 3:
                raise ValueError("Title must be at least 3 characters long if provided.")
            if len(raw_title) > 200:
                raise ValueError("Title cannot exceed 200 characters.")
            self.title = raw_title
        else:
            cat_label = self.category.replace("-", " ").title()
            if self.area:
                self.title = f"{cat_label} near {self.area}"[:200]
            else:
                self.title = f"{cat_label} observation"

        # Validate coordinates if provided
        if self.lat is not None:
            if not isinstance(self.lat, (int, float)) or self.lat < -90.0 or self.lat > 90.0:
                raise ValueError("Latitude must be a valid number between -90 and 90.")
        if self.lng is not None:
            if not isinstance(self.lng, (int, float)) or self.lng < -180.0 or self.lng > 180.0:
                raise ValueError("Longitude must be a valid number between -180 and 180.")

        # Reporter label
        rep = (self.reporter_label or "anonymous").strip()
        self.reporter_label = rep[:100] if rep else "anonymous"

        return self


class CommunityReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: str
    title: str
    description: str
    area: Optional[str] = None
    location_label: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    reporter_label: str = "anonymous"
    reporter: str = "Anonymous"
    status: str = "unverified"
    verifications: int = 0
    reported_at: datetime
    created_at: datetime
    is_demo: bool = False
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_fields(cls, data: Any) -> Any:
        if hasattr(data, "id"):
            rep_at = getattr(data, "reported_at", None) or getattr(data, "created_at", None) or datetime.now(timezone.utc)
            cr_at = getattr(data, "created_at", None) or rep_at
            area_val = getattr(data, "area", None)
            rep_label = getattr(data, "reporter_label", "anonymous") or "anonymous"
            is_demo = getattr(data, "is_demo", False) or False
            reporter_display = "Demo user" if is_demo or "demo" in rep_label.lower() else "Anonymous"
            return {
                "id": getattr(data, "id"),
                "category": getattr(data, "category", "other"),
                "title": getattr(data, "title", "Community report"),
                "description": getattr(data, "description", "") or "",
                "area": area_val,
                "location_label": area_val,
                "lat": getattr(data, "lat", None),
                "lng": getattr(data, "lng", None),
                "reporter_label": rep_label,
                "reporter": reporter_display,
                "status": getattr(data, "status", "unverified") or "unverified",
                "verifications": getattr(data, "verifications", 0) or 0,
                "reported_at": rep_at,
                "created_at": cr_at,
                "is_demo": is_demo,
                "reviewed_at": getattr(data, "reviewed_at", None),
                "reviewed_by": getattr(data, "reviewed_by", None),
            }
        elif isinstance(data, dict):
            rep_at = data.get("reported_at") or data.get("created_at") or datetime.now(timezone.utc)
            cr_at = data.get("created_at") or rep_at
            area_val = data.get("area") or data.get("location_label")
            rep_label = data.get("reporter_label") or "anonymous"
            is_demo = bool(data.get("is_demo", False))
            data["reported_at"] = rep_at
            data["created_at"] = cr_at
            data["area"] = area_val
            data["location_label"] = area_val
            data["reporter_label"] = rep_label
            if "reporter" not in data or not data["reporter"]:
                data["reporter"] = "Demo user" if is_demo or "demo" in rep_label.lower() else "Anonymous"
            if "status" not in data or not data["status"]:
                data["status"] = "unverified"
            if "verifications" not in data:
                data["verifications"] = 0
            data["is_demo"] = is_demo
            data.setdefault("reviewed_at", None)
            data.setdefault("reviewed_by", None)
        return data


VALID_REPORT_STATUSES = {
    "unverified",
    "under_review",
    "verified",
    "rejected",
    "resolved",
    "pending",
    "flagged",
}

ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "unverified": {"under_review", "verified", "rejected", "unverified"},
    "under_review": {"verified", "rejected", "unverified", "resolved", "under_review"},
    "pending": {"under_review", "verified", "rejected", "resolved", "pending"},
    "flagged": {"under_review", "rejected", "verified", "flagged"},
    "verified": {"resolved", "under_review", "rejected", "verified"},
    "rejected": {"under_review", "rejected"},
    "resolved": {"under_review", "verified", "resolved"},
}


class CommunityReportModerationUpdate(BaseModel):
    status: str
    moderator_note: Optional[str] = None
    moderator_name: Optional[str] = "community-moderator"

    @field_validator("status")
    @classmethod
    def validate_status(cls, val: str) -> str:
        clean = (val or "").strip().lower()
        if clean == "pending":
            clean = "under_review"
        if clean not in VALID_REPORT_STATUSES:
            raise ValueError(
                f"Invalid status '{val}'. Must be one of: unverified, under_review, verified, rejected, resolved"
            )
        return clean


class CommunityReportModerationRead(CommunityReportRead):
    moderator_notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_mod_fields(cls, data: Any) -> Any:
        base_data = CommunityReportRead.populate_fields(data)
        if isinstance(base_data, dict):
            if hasattr(data, "moderator_notes"):
                base_data["moderator_notes"] = getattr(data, "moderator_notes", None)
            elif isinstance(data, dict):
                base_data["moderator_notes"] = data.get("moderator_notes")
        return base_data


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
