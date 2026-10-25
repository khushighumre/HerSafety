"""
backend/routers/incidents.py

Incident Reporting API:
- POST /api/v1/incidents                                      — Create incident, returns HTTP 201
- GET  /api/v1/incidents                                      — List incidents, newest first
- GET  /api/v1/incidents/{incident_id}                        — Retrieve one incident, 404 if missing

Evidence API (sub-resource of incidents):
- POST /api/v1/incidents/{incident_id}/evidence               — Upload evidence file, returns HTTP 201
- GET  /api/v1/incidents/{incident_id}/evidence               — List evidence for an incident
- GET  /api/v1/incidents/{incident_id}/evidence/{evidence_id}/verify — Genuine SHA-256 re-verification
"""

import hashlib
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from database import get_db
from models import Evidence, Incident
from schemas import EvidenceRead, EvidenceVerifyResult, IncidentCreate, IncidentRead

logger = logging.getLogger("nightwise")

router = APIRouter(prefix="/incidents", tags=["Incidents"])

VALID_SEVERITIES = {"low", "medium", "high"}

# ---------------------------------------------------------------------------
# Evidence storage
# ---------------------------------------------------------------------------

# Stored inside backend/ — never served as static assets.
_EVIDENCE_DIR = Path(__file__).resolve().parent.parent / "evidence_store"

# Maximum upload size: 10 MB
_MAX_BYTES = 10 * 1024 * 1024

# Allowed extensions → canonical format label (per-format, not just family).
# NOTE: This check validates magic bytes against declared extension only.
# It does NOT detect malware, polyglot files, or all malformed content.
_ALLOWED_EXTENSIONS: dict[str, str] = {
    ".jpg":  "jpeg",
    ".jpeg": "jpeg",
    ".png":  "png",
    ".gif":  "gif",
    ".webp": "webp",
    ".pdf":  "pdf",
}

# Maps format label → (offset, magic_bytes).  WebP needs an extra check at [8:12].
_MAGIC: list[tuple[int, bytes, str]] = [
    (0, b"\xff\xd8\xff",          "jpeg"),
    (0, b"\x89PNG\r\n\x1a\n",    "png"),
    (0, b"GIF87a",               "gif"),
    (0, b"GIF89a",               "gif"),
    (0, b"RIFF",                 "webp"),
    (0, b"%PDF-",                "pdf"),
]

# Maps format label → canonical file_type stored in DB.
_FORMAT_TO_FILE_TYPE: dict[str, str] = {
    "jpeg": "image",
    "png":  "image",
    "gif":  "image",
    "webp": "image",
    "pdf":  "document",
}


def _generate_reference(db: Session) -> str:
    """Generate a unique HS-YYYY-NNNN reference for the current year."""
    year = datetime.now(timezone.utc).year
    prefix = f"HS-{year}-"
    # Count existing incidents for this year to derive the next sequence number.
    count = (
        db.query(Incident)
        .filter(Incident.reference.like(f"{prefix}%"))
        .count()
    )
    return f"{prefix}{count + 1:04d}"


@router.post("", response_model=IncidentRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=IncidentRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_incident(payload: IncidentCreate, db: Session = Depends(get_db)):
    title = payload.title.strip()
    category = payload.category.strip()
    summary = payload.summary.strip() if payload.summary else None
    severity = payload.severity.strip().lower()

    if not title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="title cannot be empty")
    if not category:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="category cannot be empty")
    if severity not in VALID_SEVERITIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid severity '{severity}'. Must be one of: {', '.join(sorted(VALID_SEVERITIES))}",
        )

    reference = _generate_reference(db)
    incident = Incident(
        reference=reference,
        title=title,
        category=category,
        severity=severity,
        summary=summary,
        user_label=payload.user_label.strip() or "demo-user",
        status="draft",
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident


@router.get("", response_model=List[IncidentRead])
@router.get("/", response_model=List[IncidentRead], include_in_schema=False)
def list_incidents(db: Session = Depends(get_db)):
    return db.query(Incident).order_by(Incident.id.desc()).all()


@router.get("/{incident_id}", response_model=IncidentRead)
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with ID {incident_id} was not found",
        )
    return incident


# ---------------------------------------------------------------------------
# Evidence helpers
# ---------------------------------------------------------------------------

def _get_incident_or_404(incident_id: int, db: Session) -> Incident:
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with ID {incident_id} was not found",
        )
    return incident


def _detect_file_type(data: bytes, ext: str) -> str | None:
    """
    Return the canonical file_type ("image" or "document") if:
      1. The extension is in the allow-list, AND
      2. The magic bytes match the *exact* format declared by the extension.

    PNG bytes with a .jpg extension are rejected because PNG magic maps to
    format "png" while .jpg requires format "jpeg".

    Limitations: detects only the listed formats by magic bytes.  Does not
    detect malware, polyglot files, or all malformed content.
    """
    ext_fmt = _ALLOWED_EXTENSIONS.get(ext.lower())
    if ext_fmt is None:
        return None
    for offset, magic, magic_fmt in _MAGIC:
        if data[offset : offset + len(magic)] == magic:
            # WebP: RIFF header must also contain WEBP at bytes 8-12
            if magic == b"RIFF" and data[8:12] != b"WEBP":
                continue
            if magic_fmt != ext_fmt:
                return None  # exact format mismatch (e.g. PNG bytes in .jpg)
            return _FORMAT_TO_FILE_TYPE[ext_fmt]
    return None  # no magic matched


# ---------------------------------------------------------------------------
# POST /api/v1/incidents/{incident_id}/evidence
# ---------------------------------------------------------------------------

@router.post(
    "/{incident_id}/evidence",
    response_model=EvidenceRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_evidence(
    incident_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload a file as evidence for an existing incident.

    - Validates incident existence (404 if missing).
    - Enforces 10 MB size limit on actual bytes read.
    - Validates file extension and magic bytes; rejects mismatches.
    - Generates a UUID-based storage filename; never uses the original name as a path.
    - Computes SHA-256 server-side from the exact uploaded bytes.
    - Returns evidence metadata including the full 64-char hex digest.
    - Storage path is never exposed in the response.
    """
    _get_incident_or_404(incident_id, db)

    original_name = file.filename or "upload"
    ext = Path(original_name).suffix.lower()

    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File extension '{ext}' is not supported. "
                f"Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}"
            ),
        )

    # Read all bytes — enforces actual size, not just Content-Length.
    data = await file.read(_MAX_BYTES + 1)
    if len(data) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the 10 MB maximum upload size.",
        )

    file_type = _detect_file_type(data, ext)
    if file_type is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="File content does not match the declared extension.",
        )

    digest = hashlib.sha256(data).hexdigest()
    storage_name = f"{uuid.uuid4().hex}{ext}"

    _EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    storage_path = _EVIDENCE_DIR / storage_name

    storage_path.write_bytes(data)

    try:
        record = Evidence(
            incident_id=incident_id,
            original_filename=original_name,
            storage_filename=storage_name,
            file_type=file_type,
            size_bytes=len(data),
            sha256=digest,
            hash_verified=False,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
    except Exception:
        # Clean up the orphan file if DB persistence fails.
        try:
            storage_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove orphan evidence file: %s", storage_name)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Evidence record could not be saved. The uploaded file has been removed.",
        )

    return record


# ---------------------------------------------------------------------------
# GET /api/v1/incidents/{incident_id}/evidence
# ---------------------------------------------------------------------------

@router.get("/{incident_id}/evidence", response_model=List[EvidenceRead])
def list_evidence(incident_id: int, db: Session = Depends(get_db)):
    """
    List all evidence records for an incident.
    Returns 404 if the incident does not exist.
    Returns an empty list if the incident has no evidence.
    Storage paths are never included in the response.
    """
    _get_incident_or_404(incident_id, db)
    return (
        db.query(Evidence)
        .filter(Evidence.incident_id == incident_id)
        .order_by(Evidence.id.asc())
        .all()
    )


# ---------------------------------------------------------------------------
# GET /api/v1/incidents/{incident_id}/evidence/{evidence_id}/verify
# ---------------------------------------------------------------------------

@router.get(
    "/{incident_id}/evidence/{evidence_id}/verify",
    response_model=EvidenceVerifyResult,
)
def verify_evidence(incident_id: int, evidence_id: int, db: Session = Depends(get_db)):
    """
    Genuine SHA-256 integrity verification.

    Reads the stored file bytes, recomputes SHA-256, and compares against the
    persisted digest.  Returns match=True only when verification actually ran
    and the digests agree.

    NOTE: A matching hash proves only that the stored bytes match the recorded
    digest.  It does not prove authorship, source authenticity, or legal
    admissibility.
    """
    _get_incident_or_404(incident_id, db)

    record = (
        db.query(Evidence)
        .filter(Evidence.id == evidence_id, Evidence.incident_id == incident_id)
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evidence with ID {evidence_id} was not found for incident {incident_id}",
        )

    storage_path = _EVIDENCE_DIR / record.storage_filename
    if not storage_path.exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Stored file is missing from the evidence store. "
                "Integrity cannot be verified."
            ),
        )

    try:
        file_bytes = storage_path.read_bytes()
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not read evidence file: {exc}",
        )

    computed = hashlib.sha256(file_bytes).hexdigest()
    matched = computed == record.sha256

    # Update hash_verified flag to reflect the latest check result.
    record.hash_verified = matched
    db.commit()

    return EvidenceVerifyResult(
        evidence_id=record.id,
        stored_sha256=record.sha256,
        computed_sha256=computed,
        match=matched,
    )
