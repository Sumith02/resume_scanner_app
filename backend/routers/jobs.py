from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.models import Job, JobStatus, User
from backend.rbac import JOB_CREATE, JOB_DELETE, JOB_EDIT, JOB_READ
from backend.repository import get_job, list_jobs, log_audit
from backend.schemas import JobIn
from backend.serializers import job_out

router = APIRouter(prefix="/api/org", tags=["jobs"])


def _status(value: str) -> JobStatus:
    try:
        return JobStatus(value)
    except ValueError:
        raise HTTPException(422, f"Invalid job status: {value}")


@router.get("/jobs")
def get_jobs(
    status: str | None = None,
    user: User = Depends(require_permission(JOB_READ)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    jobs = list_jobs(db, org_id, status=_status(status) if status else None)
    return [job_out(j) for j in jobs]


@router.post("/jobs")
def create_job(
    payload: JobIn,
    user: User = Depends(require_permission(JOB_CREATE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    job = Job(
        organization_id=org_id,
        title=payload.title.strip(),
        client_name=payload.client_name,
        department=payload.department,
        location=payload.location,
        employment_type=payload.employment_type,
        status=payload.status,
        salary_range=payload.salary_range,
        requirements=payload.requirements,
        skills=payload.skills,
        created_by_user_id=user.id,
    )
    db.add(job)
    db.flush()

    # Rediscovery: surface existing candidates whose skills overlap this job.
    from backend.models import Candidate

    job_skill_set = {s.lower() for s in payload.skills}
    candidates = db.query(Candidate).filter(Candidate.organization_id == org_id).all()
    matched_ids = []
    for c in candidates:
        overlap = job_skill_set & {s.lower() for s in (c.skills or [])}
        if job_skill_set and overlap and len(overlap) / len(job_skill_set) >= 0.25:
            c.matched_job_ids = list(dict.fromkeys([*(c.matched_job_ids or []), job.id]))
            matched_ids.append(c.id)

    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="job.created",
        resource_type="job",
        resource_id=job.id,
        details={"title": job.title, "rediscovered_candidates": len(matched_ids)},
    )
    db.commit()
    out = job_out(job)
    out["rediscovered_candidate_count"] = len(matched_ids)
    return out


@router.get("/jobs/{job_id}")
def get_job_detail(
    job_id: int,
    user: User = Depends(require_permission(JOB_READ)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    job = get_job(db, org_id, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job_out(job)


@router.patch("/jobs/{job_id}")
def update_job(
    job_id: int,
    payload: JobIn,
    user: User = Depends(require_permission(JOB_EDIT)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    job = get_job(db, org_id, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="job.updated",
        resource_type="job",
        resource_id=job.id,
        details={"title": job.title},
    )
    db.commit()
    return job_out(job)


@router.delete("/jobs/{job_id}")
def delete_job(
    job_id: int,
    user: User = Depends(require_permission(JOB_DELETE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    job = get_job(db, org_id, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="job.deleted",
        resource_type="job",
        resource_id=job.id,
        details={"title": job.title},
    )
    db.delete(job)
    db.commit()
    return {"message": "Job deleted"}