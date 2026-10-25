"""
SQLAlchemy ORM models for NightWise.

All SOS and emergency-related records are clearly marked as simulated —
this backend does NOT contact real emergency services.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Journey
# ---------------------------------------------------------------------------

class Journey(Base):
    __tablename__ = "journeys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Demo user identifier — no auth in this prototype.
    user_label: Mapped[str] = mapped_column(String(120), nullable=False, default="demo-user")
    origin_name: Mapped[str] = mapped_column(String(200), nullable=False)
    destination_name: Mapped[str] = mapped_column(String(200), nullable=False)
    origin_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    origin_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    destination_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    destination_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    transport_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="walk")
    # "planned" | "active" | "completed" | "cancelled"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned")
    planned_departure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    check_ins: Mapped[list["CheckIn"]] = relationship(
        "CheckIn", back_populates="journey", cascade="all, delete-orphan"
    )
    sos_alerts: Mapped[list["SosAlert"]] = relationship(
        "SosAlert", back_populates="journey", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# CheckIn
# ---------------------------------------------------------------------------

class CheckIn(Base):
    __tablename__ = "check_ins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    journey_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("journeys.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="confirmed")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    responded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    journey: Mapped["Journey"] = relationship("Journey", back_populates="check_ins")


# ---------------------------------------------------------------------------
# SosAlert  — SIMULATED, no real emergency services are contacted
# ---------------------------------------------------------------------------

class SosAlert(Base):
    __tablename__ = "sos_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    journey_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("journeys.id", ondelete="SET NULL"), nullable=True, index=True
    )
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Always True in this prototype — no real emergency services are contacted.
    is_simulated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    journey: Mapped["Journey | None"] = relationship("Journey", back_populates="sos_alerts")


# ---------------------------------------------------------------------------
# CommunityReport
# ---------------------------------------------------------------------------

class CommunityReport(Base):
    __tablename__ = "community_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    area: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    reporter_label: Mapped[str] = mapped_column(String(120), nullable=False, default="anonymous")
    # "unverified" | "pending" | "verified" | "flagged"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unverified")
    verifications: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    moderator_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(100), nullable=True)


# ---------------------------------------------------------------------------
# Incident
# ---------------------------------------------------------------------------

class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reference: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    # "low" | "medium" | "high"
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    # "draft" | "open" | "archived"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_label: Mapped[str] = mapped_column(String(120), nullable=False, default="demo-user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    evidence_items: Mapped[list["Evidence"]] = relationship(
        "Evidence", back_populates="incident", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------

class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    incident_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Original filename supplied by the user (display only).
    original_filename: Mapped[str] = mapped_column(String(260), nullable=False)
    # Server-generated storage filename (UUID-based) — actual bytes stored on disk, not in DB.
    storage_filename: Mapped[str] = mapped_column(String(260), nullable=False, unique=True)
    # "image" | "audio" | "document" | "screenshot"
    file_type: Mapped[str] = mapped_column(String(30), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    # Full SHA-256 hex digest of the file contents.
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    hash_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    incident: Mapped["Incident"] = relationship("Incident", back_populates="evidence_items")
