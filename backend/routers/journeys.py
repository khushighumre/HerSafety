"""
backend/routers/journeys.py

FastAPI router for NightWise Phase 2 Active Journeys:
- POST /api/v1/journeys: Create and persist a journey (HTTP 201)
- GET /api/v1/journeys: List saved journeys (newest first)
- GET /api/v1/journeys/{journey_id}: Retrieve one journey by ID (HTTP 404 if not found)
- POST /api/v1/journeys/{journey_id}/start: Start a planned journey
- POST /api/v1/journeys/{journey_id}/complete: Complete an active journey
- POST /api/v1/journeys/{journey_id}/cancel: Cancel a planned or active journey
- PATCH /api/v1/journeys/{journey_id}: Update journey status or timestamps
"""

from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import Journey, CheckIn
from schemas import JourneyCreate, JourneyRead, JourneyUpdate, CheckInCreate, CheckInRead

router = APIRouter(prefix="/journeys", tags=["Journeys"])


def _validate_lifecycle_transition(current_status: str, target_status: str) -> None:
    """
    Enforce strict Active Journey lifecycle state machine transitions:
    - planned -> active, cancelled
    - active -> completed, cancelled
    - completed -> terminal (no transitions permitted)
    - cancelled -> terminal (no transitions permitted)
    """
    if current_status == target_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Journey is already {current_status}",
        )

    if current_status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition a {current_status} journey. Journey lifecycle has ended.",
        )

    if current_status == "planned" and target_status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot complete a journey that has not started yet (current status: planned)",
        )

    if current_status == "active" and target_status == "planned":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revert an active journey to planned",
        )


@router.post("", response_model=JourneyRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=JourneyRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_journey(payload: JourneyCreate, db: Session = Depends(get_db)):
    """
    Create a new journey and persist it to SQLite.
    Returns HTTP 201 on success.
    Preserves started_at if provided or defaults to current timestamp for active status.
    """
    now = datetime.now(timezone.utc)
    kwargs = {
        "user_label": payload.user_label,
        "origin_name": payload.origin_name,
        "destination_name": payload.destination_name,
        "origin_lat": payload.origin_lat,
        "origin_lng": payload.origin_lng,
        "destination_lat": payload.destination_lat,
        "destination_lng": payload.destination_lng,
        "transport_mode": payload.transport_mode,
        "status": payload.status,
        "planned_departure_at": payload.planned_departure_time,
    }
    if payload.started_at is not None:
        kwargs["started_at"] = payload.started_at
    elif payload.status == "active":
        kwargs["started_at"] = now

    journey = Journey(**kwargs)
    db.add(journey)
    db.commit()
    db.refresh(journey)
    return journey


@router.get("", response_model=List[JourneyRead])
@router.get("/", response_model=List[JourneyRead], include_in_schema=False)
def list_journeys(db: Session = Depends(get_db)):
    """
    List all journeys, ordered newest first.
    Never modifies persisted timestamps on read.
    """
    return db.query(Journey).order_by(Journey.id.desc()).all()


@router.get("/{journey_id}", response_model=JourneyRead)
def get_journey(journey_id: int, db: Session = Depends(get_db)):
    """
    Retrieve one journey by unique ID.
    Returns HTTP 404 if the journey does not exist.
    Never modifies persisted timestamps on read.
    """
    journey = db.query(Journey).filter(Journey.id == journey_id).first()
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Journey with ID {journey_id} was not found",
        )
    return journey


@router.post("/{journey_id}/start", response_model=JourneyRead)
def start_journey(journey_id: int, db: Session = Depends(get_db)):
    """
    Start a planned journey.
    Sets status to 'active' and saves started_at exactly once.
    Rejects repeated start requests without resetting started_at.
    """
    journey = db.query(Journey).filter(Journey.id == journey_id).first()
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Journey with ID {journey_id} was not found",
        )

    _validate_lifecycle_transition(journey.status, "active")

    journey.status = "active"
    journey.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(journey)
    return journey


@router.post("/{journey_id}/complete", response_model=JourneyRead)
def complete_journey(journey_id: int, db: Session = Depends(get_db)):
    """
    Complete an active journey.
    Sets status to 'completed' and saves ended_at timestamp.
    """
    journey = db.query(Journey).filter(Journey.id == journey_id).first()
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Journey with ID {journey_id} was not found",
        )

    _validate_lifecycle_transition(journey.status, "completed")

    journey.status = "completed"
    journey.ended_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(journey)
    return journey


@router.post("/{journey_id}/cancel", response_model=JourneyRead)
def cancel_journey(journey_id: int, db: Session = Depends(get_db)):
    """
    Cancel a planned or active journey.
    Sets status to 'cancelled' and saves ended_at timestamp.
    """
    journey = db.query(Journey).filter(Journey.id == journey_id).first()
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Journey with ID {journey_id} was not found",
        )

    _validate_lifecycle_transition(journey.status, "cancelled")

    journey.status = "cancelled"
    journey.ended_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(journey)
    return journey


@router.patch("/{journey_id}", response_model=JourneyRead)
def update_journey(journey_id: int, payload: JourneyUpdate, db: Session = Depends(get_db)):
    """
    Update journey status or metadata with strict lifecycle transition validation.
    """
    journey = db.query(Journey).filter(Journey.id == journey_id).first()
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Journey with ID {journey_id} was not found",
        )

    now = datetime.now(timezone.utc)
    if payload.status is not None:
        _validate_lifecycle_transition(journey.status, payload.status)

        if payload.status == "active":
            journey.started_at = payload.started_at or now
        elif payload.status in ("completed", "cancelled"):
            journey.ended_at = payload.ended_at or now

        journey.status = payload.status

    if payload.started_at is not None:
        journey.started_at = payload.started_at
    if payload.ended_at is not None:
        journey.ended_at = payload.ended_at
    if payload.planned_departure_time is not None:
        journey.planned_departure_at = payload.planned_departure_time

    db.commit()
    db.refresh(journey)
    return journey


@router.post("/{journey_id}/check-ins", response_model=CheckInRead, status_code=status.HTTP_201_CREATED)
@router.post("/{journey_id}/check-ins/", response_model=CheckInRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_check_in(
    journey_id: int,
    payload: Optional[CheckInCreate] = None,
    db: Session = Depends(get_db),
):
    """
    Record a safety check-in for an active journey.
    - Returns HTTP 404 if journey does not exist.
    - Returns HTTP 400 if journey status is not 'active' (e.g. planned, completed, cancelled).
    - Persists check-in record in SQLite.
    """
    journey = db.query(Journey).filter(Journey.id == journey_id).first()
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Journey with ID {journey_id} was not found",
        )

    if journey.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Check-ins can only be recorded for active journeys (current status: {journey.status})",
        )

    now = datetime.now(timezone.utc)
    note = payload.note if payload else None
    lat = payload.lat if payload else None
    lng = payload.lng if payload else None
    checkin_status = (payload.status if payload and payload.status else "confirmed")

    check_in = CheckIn(
        journey_id=journey_id,
        status=checkin_status,
        note=note,
        lat=lat,
        lng=lng,
        created_at=now,
        responded_at=now,
        checked_at=now,
    )
    db.add(check_in)
    db.commit()
    db.refresh(check_in)
    return check_in


@router.get("/{journey_id}/check-ins", response_model=List[CheckInRead])
@router.get("/{journey_id}/check-ins/", response_model=List[CheckInRead], include_in_schema=False)
def list_check_ins(journey_id: int, db: Session = Depends(get_db)):
    """
    List all check-ins for a journey, ordered newest first.
    Returns HTTP 404 if the journey does not exist.
    """
    journey = db.query(Journey).filter(Journey.id == journey_id).first()
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Journey with ID {journey_id} was not found",
        )

    return (
        db.query(CheckIn)
        .filter(CheckIn.journey_id == journey_id)
        .order_by(CheckIn.id.desc())
        .all()
    )
