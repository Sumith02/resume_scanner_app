"""Single resume ingestion pipeline.

Every resume source — manual upload, Gmail, bulk import — funnels through
`ingest_resume` so parsing, normalization, duplicate detection, storage and
quota metering happen in exactly one place.
"""
from __future__ import annotations

import re

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

    raw_name = overrides.get("name") or guess_name(text) or filename
    raw_email = overrides.get("email") or extract_email(text)
    raw_phone = overrides.get("phone") or extract_phone(text)
    skills = extract_skills(text)
    experience = overrides.get("experience_years")
    if experience is None:
        experience = extract_experience_years(text)

    clean_name = _clean_pg_text(raw_name) or filename
    clean_email = _clean_pg_text(raw_email)
    clean_phone = _clean_pg_text(raw_phone)
    clean_title = _clean_pg_text(overrides.get("current_title"))
    clean_company = _clean_pg_text(overrides.get("current_company"))
    clean_location = _clean_pg_text(overrides.get("location"))
    raw_summary = overrides.get("summary") or (text[:1000] if text else None)
    clean_summary = _clean_pg_text(raw_summary)
    clean_text = _clean_pg_text(text)
    clean_skills = [_clean_pg_text(s) for s in skills if _clean_pg_text(s)]

    dups = find_dup_candidates(db, org.id, clean_email, clean_phone, clean_name)
    dup_of = dups[0].id if dups else None

    candidate = Candidate(
        organization_id=org.id,
        name=clean_name,
        email=clean_email,
        phone=clean_phone,
        current_title=clean_title,
        current_company=clean_company,
        location=clean_location,
        summary=clean_summary,
        skills=clean_skills,
        experience_years=experience or 0,
        source=source,
        stage=stage,
        duplicate_of_id=dup_of,
        resume_text=clean_text,
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
            "skills": clean_skills[:15],
        },
    )
    return {"candidate": candidate, "is_duplicate": dup_of is not None, "parsed_skills": clean_skills}


def _clean_pg_text(val: str | None) -> str | None:
    if val is None:
        return None
    cleaned = str(val).replace("\x00", "").strip()
    return cleaned if cleaned else None


def looks_like_resume(filename: str, content_type: str | None = None) -> bool:
    lower = (filename or "").lower()
    if content_type:
        ctype = content_type.lower()
        if "pdf" in ctype or "word" in ctype or "officedocument" in ctype:
            return True
    if lower.endswith((".pdf", ".docx", ".doc", ".txt", ".md", ".rtf", ".odt")):
        return True
    resume_markers = ("resume", "cv", "curriculum", "biodata", "profile", "candidate", "applicant")
    return any(m in lower for m in resume_markers)


def is_probably_bad_attachment(filename: str) -> bool:
    """Filter out certificates, cover letters, statements, invoices, and IDs without false-positives."""
    lower = (filename or "").lower().strip()

    # Explicit resume indicators take precedence
    has_resume_indicator = any(m in lower for m in ("resume", "cv", "curriculum", "biodata"))

    # Distinct substrings that are always non-resumes
    distinct_bad = (
        "cover_letter", "cover-letter", "coverletter", "covering_letter", "coveringletter",
        "certificate", "certification",
        "salary_slip", "salaryslip", "payslip", "pay_slip",
        "downloadstatement", "statement",
        "invoice", "receipt", "challan",
        "offer_letter", "offerletter", "appointment_letter", "relieving_letter",
        "boarding_pass", "boardingpass", "e-ticket", "eticket", "itinerary",
        "pan_card", "pancard", "aadhaar", "passport",
        "screenshot", "signature",
    )

    # Tokenized word matching (avoids matching 'form' in 'platform', 'sign' in 'designer')
    tokens = set(re.findall(r"[a-z0-9]+", lower))
    bad_tokens = {
        "statement", "downloadstatement", "invoice", "receipt", "bill", "bills",
        "payslip", "payslips", "salary", "challan", "ticket", "tickets",
        "itinerary", "booking", "policy", "insurance", "bank",
        "aadhaar", "passport", "license", "licence", "certificate", "certificates",
        "screenshot", "signature", "w2", "1099",
    }

    if has_resume_indicator:
        return any(t in tokens for t in ("cover", "coverletter", "certificate", "certification", "screenshot", "signature"))

    if any(b in lower for b in distinct_bad):
        return True

    if any(t in tokens for t in bad_tokens):
        return True

    return False