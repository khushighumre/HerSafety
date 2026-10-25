"""
backend/routers/community_reports.py

FastAPI router for Phase 3, Part 1 of NightWise:
Community Safety Report submission and persistence in SQLite.

Endpoints:
- POST /api/v1/community-reports : submit a new safety report (persists in SQLite)
- GET /api/v1/community-reports  : list safety reports (newest first, with optional category filter)
- GET /api/v1/community-reports/{id} : retrieve a single report by ID
"""

import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from database import get_db
from models import CommunityReport
from schemas import (
    CommunityReportCreate,
    CommunityReportRead,
    CommunityReportModerationRead,
    CommunityReportModerationUpdate,
    VALID_COMMUNITY_CATEGORIES,
    VALID_REPORT_STATUSES,
    ALLOWED_STATUS_TRANSITIONS,
)

logger = logging.getLogger("nightwise.community_reports_router")

router = APIRouter(prefix="/community-reports", tags=["Community Reports"])

DEFAULT_DEV_MODERATOR_KEY = "nightwise-dev-moderator-2026"

def require_moderator_auth(
    x_moderator_key: Optional[str] = Header(None, alias="X-Moderator-Key"),
) -> bool:
    """
    Moderation authorization dependency.
    In production, this would validate against a JWT or identity provider.
    For this development/demo prototype environment, actions require a valid X-Moderator-Key.
    Never exposes unrestricted status changes to anonymous public requests.
    """
    expected_key = os.getenv("NIGHTWISE_MODERATOR_KEY", DEFAULT_DEV_MODERATOR_KEY)
    if not x_moderator_key or x_moderator_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Moderator authorization required. Please provide a valid 'X-Moderator-Key' header.",
        )
    return True

# Illustrative seed demo records for evaluating UI features when no user reports exist yet.
# Clearly marked with is_demo=True and distinct IDs so they are distinguishable from real reports.
DEMO_COMMUNITY_REPORTS = [
    {
        "id": 9001,
        "category": "poor-lighting",
        "title": "Streetlights out on service road",
        "description": "Three consecutive poles not working near the metro exit.",
        "area": "Indiranagar 100ft Rd",
        "location_label": "Indiranagar 100ft Rd",
        "lat": 12.9719,
        "lng": 77.6412,
        "reporter_label": "demo-user-1",
        "reporter": "Demo user 1",
        "status": "verified",
        "verifications": 12,
        "is_demo": True,
        "reported_at": datetime(2026, 10, 25, 14, 0, tzinfo=timezone.utc),
        "created_at": datetime(2026, 10, 25, 14, 0, tzinfo=timezone.utc),
    },
    {
        "id": 9002,
        "category": "harassment",
        "title": "Repeated comments near underpass",
        "description": "Group loitering by the underpass, several incidents this week.",
        "area": "Koramangala 5th Block",
        "location_label": "Koramangala 5th Block",
        "lat": 12.9345,
        "lng": 77.622,
        "reporter_label": "demo-user-2",
        "reporter": "Demo user 2",
        "status": "verified",
        "verifications": 8,
        "is_demo": True,
        "reported_at": datetime(2026, 10, 24, 18, 0, tzinfo=timezone.utc),
        "created_at": datetime(2026, 10, 24, 18, 0, tzinfo=timezone.utc),
    },
    {
        "id": 9003,
        "category": "unsafe-area",
        "title": "Isolated stretch after 10 PM",
        "description": "No shops or people after 10 PM between the two junctions.",
        "area": "HSR Sector 2",
        "location_label": "HSR Sector 2",
        "lat": 12.9121,
        "lng": 77.6446,
        "reporter_label": "demo-user-3",
        "reporter": "Demo user 3",
        "status": "pending",
        "verifications": 2,
        "is_demo": True,
        "reported_at": datetime(2026, 10, 23, 22, 0, tzinfo=timezone.utc),
        "created_at": datetime(2026, 10, 23, 22, 0, tzinfo=timezone.utc),
    },
    {
        "id": 9004,
        "category": "transport",
        "title": "Auto drivers refusing meter",
        "description": "Drivers demand flat fare at night from this stand.",
        "area": "Majestic Bus Stand",
        "location_label": "Majestic Bus Stand",
        "lat": 12.9774,
        "lng": 77.5726,
        "reporter_label": "demo-user-4",
        "reporter": "Demo user 4",
        "status": "verified",
        "verifications": 21,
        "is_demo": True,
        "reported_at": datetime(2026, 10, 22, 19, 0, tzinfo=timezone.utc),
        "created_at": datetime(2026, 10, 22, 19, 0, tzinfo=timezone.utc),
    },
    {
        "id": 9005,
        "category": "suspicious-activity",
        "title": "Same car following walkers",
        "description": "Reported by two people independently on adjacent evenings.",
        "area": "Cubbon Park south gate",
        "location_label": "Cubbon Park south gate",
        "lat": 12.9763,
        "lng": 77.5929,
        "reporter_label": "demo-user-5",
        "reporter": "Demo user 5",
        "status": "flagged",
        "verifications": 5,
        "is_demo": True,
        "reported_at": datetime(2026, 10, 21, 20, 0, tzinfo=timezone.utc),
        "created_at": datetime(2026, 10, 21, 20, 0, tzinfo=timezone.utc),
    },
    {
        "id": 9006,
        "category": "poor-lighting",
        "title": "Dark pedestrian subway",
        "description": "Subway lighting partially broken, feels unsafe after dark.",
        "area": "Jayanagar 4th Block",
        "location_label": "Jayanagar 4th Block",
        "lat": 12.925,
        "lng": 77.5938,
        "reporter_label": "demo-user-6",
        "reporter": "Demo user 6",
        "status": "verified",
        "verifications": 15,
        "is_demo": True,
        "reported_at": datetime(2026, 10, 20, 21, 0, tzinfo=timezone.utc),
        "created_at": datetime(2026, 10, 20, 21, 0, tzinfo=timezone.utc),
    },
    {
        "id": 9007,
        "category": "other",
        "title": "Construction blocking footpath",
        "description": "Forces pedestrians onto the main road with heavy traffic.",
        "area": "MG Road",
        "location_label": "MG Road",
        "lat": 12.9756,
        "lng": 77.6068,
        "reporter_label": "demo-user-7",
        "reporter": "Demo user 7",
        "status": "pending",
        "verifications": 3,
        "is_demo": True,
        "reported_at": datetime(2026, 10, 19, 17, 0, tzinfo=timezone.utc),
        "created_at": datetime(2026, 10, 19, 17, 0, tzinfo=timezone.utc),
    },
]


@router.post("", response_model=CommunityReportRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=CommunityReportRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_report(payload: CommunityReportCreate, db: Session = Depends(get_db)):
    """
    Submit and persist a community safety report in SQLite.

    - Validates category, description, and optional location fields.
    - Initial status is explicitly set to 'unverified'.
    - Timestamps are generated by the backend.
    - Personal identities are not collected; reporter_label defaults to 'anonymous'.
    """
    now = datetime.now(timezone.utc)

    report = CommunityReport(
        category=payload.category,
        title=payload.title,
        description=payload.description,
        area=payload.area,
        lat=payload.lat,
        lng=payload.lng,
        reporter_label=payload.reporter_label or "anonymous",
        status="unverified",
        verifications=0,
        reported_at=now,
        created_at=now,
        is_demo=False,
    )

    db.add(report)
    db.commit()
    db.refresh(report)

    logger.info(f"Persisted community safety report #{report.id} ({report.category})")
    return report


@router.get("", response_model=List[CommunityReportRead])
@router.get("/", response_model=List[CommunityReportRead], include_in_schema=False)
def list_reports(
    category: Optional[str] = Query(None, description="Optional category filter"),
    status: Optional[str] = Query(None, description="Optional status filter"),
    include_demo: bool = Query(True, description="Whether to include illustrative demo records"),
    db: Session = Depends(get_db),
):
    """
    List community safety reports, newest first.

    User-submitted reports from SQLite are returned first.
    Demo/seed records are clearly marked with is_demo=True and distinguishable.
    Public responses exclude private moderator notes.
    """
    normalized_category = None
    if category and category != "all":
        clean = category.strip().lower()
        normalized_category = VALID_COMMUNITY_CATEGORIES.get(clean, clean)

    normalized_status = None
    if status and status != "all":
        clean_status = status.strip().lower()
        if clean_status == "pending":
            clean_status = "under_review"
        normalized_status = clean_status

    query = db.query(CommunityReport).order_by(CommunityReport.id.desc())

    if normalized_category:
        query = query.filter(CommunityReport.category == normalized_category)
    if normalized_status:
        query = query.filter(CommunityReport.status == normalized_status)

    user_reports = query.all()

    if not include_demo:
        return user_reports

    # Include demo records (matching category and status filter if specified)
    matched_demo = []
    for d in DEMO_COMMUNITY_REPORTS:
        if normalized_category and d["category"] != normalized_category:
            continue
        demo_status = d.get("status", "unverified")
        if demo_status == "pending":
            demo_status = "under_review"
        if normalized_status and demo_status != normalized_status:
            continue
        matched_demo.append(d)

    return list(user_reports) + matched_demo


@router.get("/moderation/reports", response_model=List[CommunityReportModerationRead])
def list_moderation_reports(
    status: Optional[str] = Query(None, description="Optional status filter"),
    category: Optional[str] = Query(None, description="Optional category filter"),
    include_demo: bool = Query(True, description="Whether to include demo records"),
    db: Session = Depends(get_db),
    _auth: bool = Depends(require_moderator_auth),
):
    """
    Authorized endpoint for moderation review queue.
    Returns full report data including private moderator notes.
    Protected by X-Moderator-Key.
    """
    normalized_category = None
    if category and category != "all":
        clean = category.strip().lower()
        normalized_category = VALID_COMMUNITY_CATEGORIES.get(clean, clean)

    normalized_status = None
    if status and status != "all":
        clean_status = status.strip().lower()
        if clean_status == "pending":
            clean_status = "under_review"
        normalized_status = clean_status

    query = db.query(CommunityReport).order_by(CommunityReport.id.desc())

    if normalized_category:
        query = query.filter(CommunityReport.category == normalized_category)
    if normalized_status:
        query = query.filter(CommunityReport.status == normalized_status)

    user_reports = query.all()

    if not include_demo:
        return user_reports

    matched_demo = []
    for d in DEMO_COMMUNITY_REPORTS:
        if normalized_category and d["category"] != normalized_category:
            continue
        demo_status = d.get("status", "unverified")
        if demo_status == "pending":
            demo_status = "under_review"
        if normalized_status and demo_status != normalized_status:
            continue
        matched_demo.append(d)

    return list(user_reports) + matched_demo


@router.patch("/{report_id}/moderation", response_model=CommunityReportModerationRead)
@router.post("/{report_id}/moderate", response_model=CommunityReportModerationRead)
def moderate_report(
    report_id: int,
    payload: CommunityReportModerationUpdate,
    db: Session = Depends(get_db),
    _auth: bool = Depends(require_moderator_auth),
):
    """
    Authorized moderation action on a report.
    - Validates allowed status transitions.
    - Updates review status, timestamp, reviewer label, and private moderator notes.
    - Preserves creation timestamps and original reporter details.
    """
    # 1. Search database
    report = db.query(CommunityReport).filter(CommunityReport.id == report_id).first()
    if report:
        curr = report.status or "unverified"
        if curr == "pending":
            curr = "under_review"
        target = payload.status
        allowed = ALLOWED_STATUS_TRANSITIONS.get(curr, set())
        if target not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status transition from '{curr}' to '{target}'. Allowed transitions: {sorted(list(allowed))}",
            )

        now = datetime.now(timezone.utc)
        report.status = target
        if payload.moderator_note is not None:
            report.moderator_notes = payload.moderator_note
        report.reviewed_at = now
        report.reviewed_by = payload.moderator_name or "community-moderator"

        db.commit()
        db.refresh(report)
        logger.info(f"Moderated report #{report_id}: status set to '{target}' by {report.reviewed_by}")
        return report

    # 2. Search demo records
    for d in DEMO_COMMUNITY_REPORTS:
        if d["id"] == report_id:
            curr = d.get("status", "unverified")
            if curr == "pending":
                curr = "under_review"
            target = payload.status
            allowed = ALLOWED_STATUS_TRANSITIONS.get(curr, set())
            if target not in allowed:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid status transition from '{curr}' to '{target}'. Allowed transitions: {sorted(list(allowed))}",
                )

            now = datetime.now(timezone.utc)
            d["status"] = target
            d["moderator_notes"] = payload.moderator_note
            d["reviewed_at"] = now
            d["reviewed_by"] = payload.moderator_name or "community-moderator"
            return d

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Community report with ID {report_id} was not found",
    )


@router.get("/{report_id}", response_model=CommunityReportRead)
def get_report(report_id: int, db: Session = Depends(get_db)):
    """
    Retrieve a single community safety report by its unique ID.
    Returns 404 if the record is not found.
    Public response excludes private moderator notes.
    """
    report = db.query(CommunityReport).filter(CommunityReport.id == report_id).first()
    if report:
        return report

    # Check demo reports for matching ID
    for d in DEMO_COMMUNITY_REPORTS:
        if d["id"] == report_id:
            return d

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Community report with ID {report_id} was not found",
    )
