from __future__ import annotations

import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.config import MAX_RESUME_BYTES, UPLOAD_DIR
from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.models import Candidate, CandidateStage, Note, Organization, SourceKind, Tag, User
from backend.rbac import (
    CANDIDATE_CREATE,
    CANDIDATE_DELETE,
    CANDIDATE_EDIT,
    CANDIDATE_READ,
    NOTE_CREATE,
    PIPELINE_MANAGE,
    TAG_MANAGE,
)
from backend.ingestion import _clean_pg_text, ingest_resume, is_probably_bad_attachment
from backend.repository import (
    find_dup_candidates,
    get_candidate,
    list_candidates,
    list_notes,
    list_tags,
    log_audit,
)
from backend.resume_service import (
    extract_email,
    extract_experience_years,
    extract_current_title,
    extract_location,
    extract_phone,
    extract_resume_text,
    extract_skills,
    extract_summary,
    guess_name,
    save_upload,
)
from backend.schemas import (
    CandidatePatch,
    CandidateStageUpdate,
    CandidateTagPatch,
    NoteIn,
    TagIn,
)
from backend.serializers import candidate_out, note_out, tag_out

router = APIRouter(prefix="/api/org", tags=["candidates"])


def _resume_disk_path(relative_path: str) -> str | None:
    """Resolve uploads written to the configured directory or its serverless fallback."""
    candidates = [f"{UPLOAD_DIR}/{relative_path}"]
    if "/tmp" not in UPLOAD_DIR:
        candidates.append(f"/tmp/uploads/{relative_path}")
    return next((path for path in candidates if os.path.exists(path)), None)


def _assert_stage(value: str) -> CandidateStage:
    try:
        return CandidateStage(value)
    except ValueError:
        raise HTTPException(422, f"Invalid stage: {value}")


def _match_jobs(db: Session, org_id: int, skills: list[str]) -> list[int]:
    from backend.models import Job, JobStatus

    if not skills:
        return []
    skill_set = {s.lower() for s in skills}
    jobs = (
        db.query(Job)
        .filter(Job.organization_id == org_id, Job.status != JobStatus.CLOSED)
        .all()
    )
    matched = []
    for j in jobs:
        job_skills = {s.lower() for s in (j.skills or [])}
        overlap = skill_set & job_skills
        if overlap and len(overlap) / max(1, len(job_skills)) >= 0.25:
            matched.append(j.id)
    return matched


@router.get("/candidates")
def search_candidates(
    stage: str | None = None,
    q: str | None = Query(None, max_length=300),
    tag_id: int | None = None,
    job_id: int | None = None,
    location: str | None = Query(None, max_length=100),
    skill: str | None = Query(None, max_length=100),
    user: User = Depends(require_permission(CANDIDATE_READ)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    stage_enum = _assert_stage(stage) if stage else None
    rows = list_candidates(
        db,
        org_id,
        stage=stage_enum,
        query=q,
        tag_id=tag_id,
        job_id=job_id,
        location=location,
        skill=skill,
    )
    return [candidate_out(c) for c in rows]


@router.get("/candidates/{candidate_id}")
def get_candidate_detail(
    candidate_id: int,
    user: User = Depends(require_permission(CANDIDATE_READ)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    c = get_candidate(db, org_id, candidate_id)
    if c is None:
        raise HTTPException(404, "Candidate not found")
    return candidate_out(c)


@router.delete("/candidates/{candidate_id}")
def delete_candidate(
    candidate_id: int,
    user: User = Depends(require_permission(CANDIDATE_DELETE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    c = get_candidate(db, org_id, candidate_id)
    if c is None:
        raise HTTPException(404, "Candidate not found")
    if c.resume_path:
        path = _resume_disk_path(c.resume_path)
        if path:
            try:
                from backend.plans import increment_usage
                increment_usage(db, org_id, "storage_mb", -max(1, (os.path.getsize(path) + (1024 * 1024) - 1) // (1024 * 1024)))
                os.remove(path)
            except Exception:
                pass
    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="candidate.deleted",
        resource_type="candidate",
        resource_id=c.id,
        details={"name": c.name},
    )
    db.delete(c)
    db.commit()
    return {"message": "Candidate deleted"}


class BulkDeleteIn(BaseModel):
    candidate_ids: list[int]


@router.post("/candidates/bulk-delete")
def bulk_delete_candidates(
    payload: BulkDeleteIn,
    user: User = Depends(require_permission(CANDIDATE_DELETE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    deleted_count = 0
    for cid in payload.candidate_ids:
        c = get_candidate(db, org_id, cid)
        if c:
            if c.resume_path:
                path = _resume_disk_path(c.resume_path)
                if path:
                    try:
                        from backend.plans import increment_usage
                        increment_usage(db, org_id, "storage_mb", -max(1, (os.path.getsize(path) + (1024 * 1024) - 1) // (1024 * 1024)))
                        os.remove(path)
                    except Exception:
                        pass
            db.delete(c)
            deleted_count += 1
    db.commit()
    return {"deleted": deleted_count}


@router.post("/candidates")
async def create_candidate(
    resume: UploadFile | None = File(None),
    name: str | None = Form(None),
    email: str | None = Form(None),
    phone: str | None = Form(None),
    current_title: str | None = Form(None),
    current_company: str | None = Form(None),
    location: str | None = Form(None),
    summary: str | None = Form(None),
    skills_csv: str | None = Form(None),
    experience_years: int | None = Form(None),
    stage: str = Form(CandidateStage.NEW.value),
    job_ids_csv: str | None = Form(None),
    manual_source: str = Form("MANUAL"),
    user: User = Depends(require_permission(CANDIDATE_CREATE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    stage_enum = _assert_stage(stage)

    org = db.get(Organization, org_id)
    from backend.plans import consume_quota

    consume_quota(db, org, "candidates", 1)
    if resume is not None and resume.filename:
        consume_quota(db, org, "resume_parses", 1)

    resume_text = ""
    resume_rel = None
    if resume is not None and resume.filename:
        data = await resume.read()
        if len(data) > MAX_RESUME_BYTES:
            raise HTTPException(413, "Resume larger than 10MB")
        storage_mb = max(1, (len(data) + (1024 * 1024) - 1) // (1024 * 1024))
        consume_quota(db, org, "storage_mb", storage_mb)
        resume_text = extract_resume_text(resume.filename, data)
        # Manual uploads keep support for short/simple CVs, but reject
        # unmistakable invoices, statements, IDs and similar documents too.
        lower_text = resume_text.lower()
        obvious_non_resume = any(marker in lower_text for marker in (
            "tax invoice", "invoice no", "bill to", "bank statement", "salary slip",
            "aadhaar card", "this certifies that", "job description",
        ))
        if is_probably_bad_attachment(resume.filename) or obvious_non_resume:
            raise HTTPException(422, "The uploaded document does not appear to be a resume")

        parsed_name = name or guess_name(resume_text) or resume.filename
        parsed_email = email or extract_email(resume_text)
        parsed_phone = phone or extract_phone(resume_text)
        parsed_skills = extract_skills(resume_text)
        parsed_exp = experience_years
        if parsed_exp is None:
            parsed_exp = extract_experience_years(resume_text)
        parsed_title = current_title or extract_current_title(resume_text)

        # keep raw bytes until candidate row exists (needs candidate.id for path)
        raw = data

    else:
        parsed_name = name
        parsed_email = email
        parsed_phone = phone
        parsed_skills = ([s.strip() for s in skills_csv.split(",")] if skills_csv else [])
        parsed_exp = experience_years
        parsed_title = current_title
        raw = None

    clean_name = _clean_pg_text(parsed_name)
    if not clean_name:
        raise HTTPException(422, "name is required when no resume is uploaded")

    clean_email = _clean_pg_text(parsed_email)
    clean_phone = _clean_pg_text(parsed_phone)
    clean_title = _clean_pg_text(parsed_title)
    clean_company = _clean_pg_text(current_company)
    clean_text = _clean_pg_text(resume_text)
    clean_skills = [_clean_pg_text(s) for s in parsed_skills if _clean_pg_text(s)]
    clean_location = _clean_pg_text(location or (extract_location(clean_text) if clean_text else None))
    raw_summary = summary or (extract_summary(clean_text, title=clean_title, exp_years=parsed_exp, skills=clean_skills) if clean_text else None)
    clean_summary = _clean_pg_text(raw_summary)

    # Duplicate detection within the tenant.
    dups = find_dup_candidates(db, org_id, clean_email, clean_phone, clean_name)
    dup_of = dups[0].id if dups else None

    job_ids = [int(x) for x in job_ids_csv.split(",") if x.strip().isdigit()] if job_ids_csv else []

    try:
        source = SourceKind(manual_source)
    except ValueError:
        source = SourceKind.MANUAL

    candidate = Candidate(
        organization_id=org_id,
        name=clean_name,
        email=clean_email,
        phone=clean_phone,
        current_title=clean_title,
        current_company=clean_company,
        location=clean_location,
        summary=clean_summary,
        skills=clean_skills,
        experience_years=parsed_exp or 0,
        source=source,
        stage=stage_enum,
        duplicate_of_id=dup_of,
        resume_text=clean_text,
        created_by_user_id=user.id,
    )
    candidate.matched_job_ids = job_ids or _match_jobs(db, org_id, candidate.skills)
    db.add(candidate)
    db.flush()

    if raw is not None:
        resume_rel = save_upload(org_id, candidate.id, resume.filename, raw, UPLOAD_DIR)
        candidate.resume_path = resume_rel
        candidate.resume_filename = resume.filename
        if not candidate.duplicate_of_id:
            candidate.duplicate_of_id = dup_of

    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="candidate.created",
        resource_type="candidate",
        resource_id=candidate.id,
        details={
            "name": candidate.name,
            "source": source.value,
            "duplicate_of": candidate.duplicate_of_id,
        },
    )
    db.commit()
    return candidate_out(candidate)


@router.post("/candidates/bulk-upload")
async def bulk_upload_candidates(
    resumes: list[UploadFile] = File(...),
    job_id: int | None = Form(None),
    stage: str | None = Form("NEW"),
    user: User = Depends(require_permission(CANDIDATE_CREATE)),
    db: Session = Depends(get_db),
):
    """Manually bulk upload multiple resumes simultaneously with batch parsing and duplicate detection."""
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")

    stage_enum = _assert_stage(stage) if stage else CandidateStage.NEW

    succeeded = []
    errors = []
    duplicate_count = 0

    for file in resumes:
        fn = file.filename or "resume.pdf"
        try:
            content = await file.read()
            if not content:
                errors.append({"filename": fn, "error": "File is empty"})
                continue
            if len(content) > MAX_RESUME_BYTES:
                errors.append({
                    "filename": fn,
                    "error": f"File exceeds {MAX_RESUME_BYTES // (1024 * 1024)}MB size limit",
                })
                continue

            overrides = {}
            if job_id:
                overrides["job_id"] = job_id

            res = ingest_resume(
                db,
                org=org,
                filename=fn,
                data=content,
                source=SourceKind.UPLOAD,
                created_by_user_id=user.id,
                stage=stage_enum,
                actor_email=user.email,
                overrides=overrides,
                meter=True,
            )
            cand = res["candidate"]
            if res.get("is_duplicate"):
                duplicate_count += 1
            succeeded.append(cand)
        except Exception as exc:
            errors.append({"filename": fn, "error": str(exc)})

    db.commit()

    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="candidate.bulk_uploaded",
        resource_type="candidate",
        resource_id=None,
        details={
            "total_files": len(resumes),
            "succeeded": len(succeeded),
            "duplicates": duplicate_count,
            "failed": len(errors),
        },
    )

    return {
        "total": len(resumes),
        "succeeded": len(succeeded),
        "duplicates": duplicate_count,
        "failed": len(errors),
        "candidates": [candidate_out(c) for c in succeeded],
        "errors": errors,
    }


@router.patch("/candidates/{candidate_id}/stage")
def update_stage(
    candidate_id: int,
    payload: CandidateStageUpdate,
    user: User = Depends(require_permission(PIPELINE_MANAGE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    c = get_candidate(db, org_id, candidate_id)
    if c is None:
        raise HTTPException(404, "Candidate not found")
    old, c.stage = c.stage, payload.stage
    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="candidate.stage_changed",
        resource_type="candidate",
        resource_id=c.id,
        details={"from": old.value, "to": payload.stage.value},
    )
    db.commit()
    return candidate_out(c)


@router.patch("/candidates/{candidate_id}")
def patch_candidate(
    candidate_id: int,
    payload: CandidatePatch,
    user: User = Depends(require_permission(CANDIDATE_EDIT)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    c = get_candidate(db, org_id, candidate_id)
    if c is None:
        raise HTTPException(404, "Candidate not found")
    if payload.job_ids:
        c.matched_job_ids = payload.job_ids
    else:
        if payload.add_job_ids:
            c.matched_job_ids = list(dict.fromkeys([*(c.matched_job_ids or []), *payload.add_job_ids]))
        if payload.remove_job_ids:
            c.matched_job_ids = [j for j in (c.matched_job_ids or []) if j not in payload.remove_job_ids]
    db.commit()
    return candidate_out(c)


@router.get("/candidates/{candidate_id}/resume")
def download_resume(
    candidate_id: int,
    user: User = Depends(require_permission(CANDIDATE_READ)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    c = get_candidate(db, org_id, candidate_id)
    if c is None:
        raise HTTPException(404, "Candidate not found")
    if not c.resume_path:
        raise HTTPException(404, "No resume on file")
    path = _resume_disk_path(c.resume_path)
    if not path:
        raise HTTPException(404, "Resume file missing on disk")
    return FileResponse(path, filename=c.resume_filename or os.path.basename(path))


# -- Notes ----------------------------------------------------------------

@router.get("/candidates/{candidate_id}/notes")
def get_notes(
    candidate_id: int,
    user: User = Depends(require_permission(CANDIDATE_READ)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    c = get_candidate(db, org_id, candidate_id)
    if c is None:
        raise HTTPException(404, "Candidate not found")
    return [note_out(n) for n in list_notes(db, org_id, candidate_id)]


@router.post("/candidates/{candidate_id}/notes")
def create_note(
    candidate_id: int,
    payload: NoteIn,
    user: User = Depends(require_permission(NOTE_CREATE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    c = get_candidate(db, org_id, candidate_id)
    if c is None:
        raise HTTPException(404, "Candidate not found")
    note = Note(
        organization_id=org_id,
        candidate_id=candidate_id,
        author_user_id=user.id,
        body=payload.body.strip(),
    )
    db.add(note)
    db.flush()
    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="note.created",
        resource_type="candidate",
        resource_id=c.id,
        details={"note_id": note.id},
    )
    db.commit()
    return note_out(note)


# -- Tags -----------------------------------------------------------------

@router.get("/tags")
def get_tags(
    user: User = Depends(require_permission(CANDIDATE_READ)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    return [tag_out(t) for t in list_tags(db, org_id)]


@router.post("/tags")
def create_tag(
    payload: TagIn,
    user: User = Depends(require_permission(TAG_MANAGE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    existing = db.query(Tag).filter(Tag.organization_id == org_id, Tag.name == payload.name).first()
    if existing:
        return tag_out(existing)
    tag = Tag(organization_id=org_id, name=payload.name.strip(), color=payload.color)
    db.add(tag)
    db.commit()
    return tag_out(tag)


@router.patch("/candidates/{candidate_id}/tags")
def patch_candidate_tags(
    candidate_id: int,
    payload: CandidateTagPatch,
    user: User = Depends(require_permission(CANDIDATE_EDIT)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    c = get_candidate(db, org_id, candidate_id)
    if c is None:
        raise HTTPException(404, "Candidate not found")
    if payload.tag_ids:
        tags = db.query(Tag).filter(Tag.id.in_(payload.tag_ids), Tag.organization_id == org_id).all()
        c.tags = tags
    else:
        if payload.add_tag_ids:
            tags = db.query(Tag).filter(Tag.id.in_(payload.add_tag_ids), Tag.organization_id == org_id).all()
            for t in tags:
                if t not in c.tags:
                    c.tags.append(t)
        if payload.remove_tag_ids:
            c.tags = [t for t in c.tags if t.id not in payload.remove_tag_ids]
    db.commit()
    return candidate_out(c)


# -- Pipeline -------------------------------------------------------------

@router.get("/pipeline")
def pipeline_overview(
    user: User = Depends(require_permission(CANDIDATE_READ)),
    db: Session = Depends(get_db),
):
    from sqlalchemy import func

    org_id = ensure_company_scope(user)
    rows = (
        db.query(Candidate.stage, func.count(Candidate.id))
        .filter(Candidate.organization_id == org_id)
        .group_by(Candidate.stage)
        .all()
    )
    counts = {r[0].value if hasattr(r[0], "value") else r[0]: r[1] for r in rows}
    return {
        "stages": [s.value for s in CandidateStage],
        "counts": counts,
    }
