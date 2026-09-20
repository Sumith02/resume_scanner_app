"""Single resume ingestion pipeline.

Every resume source — manual upload, Gmail, bulk import — funnels through
`ingest_resume` so parsing, normalization, duplicate detection, storage and
quota metering happen in exactly one place.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from backend.config import UPLOAD_DIR
from backend.models import Candidate, CandidateStage, Organization, SourceKind
from backend.repository import find_dup_candidates, log_audit
from backend.resume_service import (
    extract_email,
    extract_experience_years,
    extract_phone,
    extract_resume_text,
    extract_skills,
    guess_name,
    save_upload,
)


def ingest_resume(
    db: Session,
    *,
    org: Organization,
    filename: str,
    data: bytes,
    source: SourceKind = SourceKind.UPLOAD,
    created_by_user_id: int | None = None,
    stage: CandidateStage = CandidateStage.NEW,
    actor_email: str = "system@source",
    overrides: dict | None = None,
    meter: bool = True,
) -> dict:
    """Parse a resume and create (or dedupe) a candidate.

    Returns {"candidate": Candidate, "is_duplicate": bool, "parsed_skills": [...]}.
    """
    overrides = overrides or {}
    if meter:
        from backend.plans import check_quota, increment_usage

        check_quota(db, org, "resume_parses", 1)
        check_quota(db, org, "candidates", 1)
    text = extract_resume_text(filename, data)

    name = overrides.get("name") or guess_name(text) or filename
    email = overrides.get("email") or extract_email(text)
    phone = overrides.get("phone") or extract_phone(text)
    skills = extract_skills(text)
    experience = overrides.get("experience_years")
    if experience is None:
        experience = extract_experience_years(text)

    dups = find_dup_candidates(db, org.id, email, phone, name)
    dup_of = dups[0].id if dups else None

    candidate = Candidate(
        organization_id=org.id,
        name=overrides.get("name") or name,
        email=email,
        phone=phone,
        current_title=overrides.get("current_title"),
        current_company=overrides.get("current_company"),
        location=overrides.get("location"),
        summary=overrides.get("summary") or (text[:1000] if text else None),
        skills=skills,
        experience_years=experience or 0,
        source=source,
        stage=stage,
        duplicate_of_id=dup_of,
        resume_text=text or None,
        created_by_user_id=created_by_user_id,
    )
    db.add(candidate)
    db.flush()

    rel = save_upload(org.id, candidate.id, filename, data, UPLOAD_DIR)
    candidate.resume_path = rel
    candidate.resume_filename = filename

    if meter:
        from backend.plans import increment_usage

        increment_usage(db, org.id, "resume_parses", 1)
        increment_usage(db, org.id, "candidates", 1)

    log_audit(
        db,
        org_id=org.id,
        actor_user_id=created_by_user_id or 0,
        actor_email=actor_email,
        action="candidate.ingested",
        resource_type="candidate",
        resource_id=candidate.id,
        details={
            "source": source.value if hasattr(source, "value") else source,
            "filename": filename,
            "duplicate_of": dup_of,
            "skills": skills[:15],
        },
    )
    return {"candidate": candidate, "is_duplicate": dup_of is not None, "parsed_skills": skills}


def looks_like_resume(filename: str, content_type: str | None = None) -> bool:
    lower = (filename or "").lower()
    if lower.endswith((".pdf", ".docx", ".doc", ".txt", ".md", ".rtf", ".odt")):
        return True
    resume_markers = ("resume", "cv", "curriculum")
    return any(m in lower for m in resume_markers)


def is_probably_bad_attachment(filename: str) -> bool:
    """Filter out certificates, cover letters, signatures and images."""
    lower = (filename or "").lower()
    bad = ("certificate", "cover", "signature", "sign", "logo", "image",
           "screenshot", "invoice", "receipt", "offer letter")
    return any(b in lower for b in bad)