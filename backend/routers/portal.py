"""Phase 5 — Client portal (tokenized read-only sharing).

Authenticated endpoints let a company mint and manage share links; the public
endpoints under /api/portal/{token} expose a deliberately narrow, read-only
view to external clients — no resumes, contact details, notes or internal IDs.
"""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.models import (
    Candidate,
    ClientPortalToken,
    Job,
    Organization,
    User,
    utcnow,
)
from backend.plans import require_feature
from backend.rbac import PORTAL_MANAGE
from backend.repository import json_array_contains_id, log_audit
from backend.security import generate_invite_token, hash_token
from backend.serializers import portal_token_out

router = APIRouter(prefix="/api/portal", tags=["client-portal"])


def _org(db: Session, user: User) -> Organization:
    org = db.get(Organization, user.organization_id)
    if org is None:
        raise HTTPException(404, "Organization not found")
    return org


# -- Management (authenticated) ------------------------------------------

class TokenIn(BaseModel):
    client_name: str = Field(min_length=1, max_length=200)
    job_ids: list[int] = Field(default_factory=list)
    can_view_candidates: bool = True
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class TokenPatch(BaseModel):
    client_name: str | None = None
    job_ids: list[int] | None = None
    can_view_candidates: bool | None = None
    is_active: bool | None = None
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


@router.get("/tokens")
def list_tokens(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PORTAL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    rows = (
        db.query(ClientPortalToken)
        .filter(ClientPortalToken.organization_id == org_id)
        .order_by(ClientPortalToken.created_at.desc())
        .all()
    )
    return [portal_token_out(t) for t in rows]


@router.post("/tokens", status_code=201)
def create_token(
    payload: TokenIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PORTAL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)
    require_feature(org, "client_portal")

    secret = generate_invite_token()
    row = ClientPortalToken(
        organization_id=org_id,
        client_name=payload.client_name,
        token_hash=hash_token(secret),
        job_ids=payload.job_ids,
        can_view_candidates=payload.can_view_candidates,
        expires_at=(utcnow() + timedelta(days=payload.expires_in_days)) if payload.expires_in_days else None,
        created_by_user_id=user.id,
    )
    db.add(row)
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="portal_token.created", resource_type="client_portal_token",
              resource_id=None, details={"client_name": payload.client_name})
    db.commit()
    db.refresh(row)
    return portal_token_out(row, include_secret=secret)


@router.patch("/tokens/{token_id}")
def update_token(
    token_id: int,
    payload: TokenPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PORTAL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    row = (
        db.query(ClientPortalToken)
        .filter(ClientPortalToken.id == token_id,
                ClientPortalToken.organization_id == org_id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Portal token not found")
    data = payload.model_dump(exclude_unset=True)
    expires_days = data.pop("expires_in_days", None)
    for field, value in data.items():
        setattr(row, field, value)
    if expires_days is not None:
        row.expires_at = utcnow() + timedelta(days=expires_days)
    db.commit()
    return portal_token_out(row)


@router.delete("/tokens/{token_id}", status_code=204)
def delete_token(
    token_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PORTAL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    row = (
        db.query(ClientPortalToken)
        .filter(ClientPortalToken.id == token_id,
                ClientPortalToken.organization_id == org_id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Portal token not found")
    db.delete(row)
    db.commit()


# -- Public (tokenized) ---------------------------------------------------

def _resolve(db: Session, token: str) -> ClientPortalToken:
    row = (
        db.query(ClientPortalToken)
        .filter(ClientPortalToken.token_hash == hash_token(token))
        .first()
    )
    if row is None or not row.is_active:
        raise HTTPException(404, "Portal link is invalid or disabled")
    if row.expires_at and row.expires_at < utcnow():
        raise HTTPException(410, "Portal link has expired")
    row.last_viewed_at = utcnow()
    db.flush()
    return row


def _public_candidate(c: Candidate) -> dict:
    return {
        "name": c.name,
        "current_title": c.current_title,
        "current_company": c.current_company,
        "location": c.location,
        "skills": c.skills or [],
        "experience_years": c.experience_years,
        "stage": c.stage.value if hasattr(c.stage, "value") else c.stage,
    }


@router.get("/{token}")
def portal_view(token: str, db: Session = Depends(get_db)):
    row = _resolve(db, token)
    org = db.get(Organization, row.organization_id)

    jobs_q = db.query(Job).filter(Job.organization_id == row.organization_id)
    if row.job_ids:
        jobs_q = jobs_q.filter(Job.id.in_(row.job_ids))
    jobs = jobs_q.order_by(Job.created_at.desc()).all()

    payload = {
        "client_name": row.client_name,
        "organization": org.name if org else None,
        "can_view_candidates": row.can_view_candidates,
        "jobs": [
            {
                "id": j.id,
                "title": j.title,
                "location": j.location,
                "status": j.status.value if hasattr(j.status, "value") else j.status,
                "employment_type": j.employment_type,
                "candidates": (
                    _pipeline_counts(db, row.organization_id, j.id)
                    if row.can_view_candidates else None
                ),
            }
            for j in jobs
        ],
    }
    db.commit()
    return payload


@router.get("/{token}/jobs/{job_id}/candidates")
def portal_job_candidates(token: str, job_id: int, db: Session = Depends(get_db)):
    row = _resolve(db, token)
    if not row.can_view_candidates:
        raise HTTPException(403, "This link does not allow candidate viewing")
    if row.job_ids and job_id not in row.job_ids:
        raise HTTPException(404, "Job not shared with this portal link")

    job = (
        db.query(Job)
        .filter(Job.id == job_id, Job.organization_id == row.organization_id)
        .first()
    )
    if job is None:
        raise HTTPException(404, "Job not found")

    candidates = (
        db.query(Candidate)
        .filter(
            Candidate.organization_id == row.organization_id,
            json_array_contains_id(Candidate.matched_job_ids, job_id),
        )
        .all()
    )
    db.commit()
    return {
        "job": {"id": job.id, "title": job.title},
        "count": len(candidates),
        "candidates": [_public_candidate(c) for c in candidates],
    }


def _pipeline_counts(db: Session, org_id: int, job_id: int) -> dict:
    candidates = (
        db.query(Candidate)
        .filter(
            Candidate.organization_id == org_id,
            json_array_contains_id(Candidate.matched_job_ids, job_id),
        )
        .all()
    )
    counts: dict[str, int] = {}
    for c in candidates:
        stage = c.stage.value if hasattr(c.stage, "value") else str(c.stage)
        counts[stage] = counts.get(stage, 0) + 1
    return {"total": len(candidates), "by_stage": counts}
