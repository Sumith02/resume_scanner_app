"""Phase 4 — Interviews and scorecards."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.models import (
    CandidateStage,
    Interview,
    InterviewMode,
    InterviewStatus,
    Scorecard,
    User,
)
from backend.rbac import (
    INTERVIEW_MANAGE,
    INTERVIEW_READ,
    SCORECARD_SUBMIT,
)
from backend.repository import get_candidate, get_job, log_audit
from backend.serializers import interview_out, scorecard_out

router = APIRouter(prefix="/api/interviews", tags=["interviews"])


def _get(db: Session, org_id: int, interview_id: int) -> Interview:
    row = (
        db.query(Interview)
        .filter(Interview.id == interview_id, Interview.organization_id == org_id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Interview not found")
    return row


class InterviewIn(BaseModel):
    candidate_id: int
    job_id: int | None = None
    title: str | None = None
    scheduled_at: datetime | None = None
    duration_minutes: int = 60
    mode: InterviewMode = InterviewMode.VIDEO
    location: str | None = None
    interviewer_user_id: int | None = None


class InterviewPatch(BaseModel):
    title: str | None = None
    scheduled_at: datetime | None = None
    duration_minutes: int | None = None
    mode: InterviewMode | None = None
    location: str | None = None
    status: InterviewStatus | None = None
    interviewer_user_id: int | None = None


@router.get("")
def list_interviews(
    status: str | None = None,
    candidate_id: int | None = None,
    job_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(INTERVIEW_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    q = db.query(Interview).filter(Interview.organization_id == org_id)
    if status:
        q = q.filter(Interview.status == status)
    if candidate_id:
        q = q.filter(Interview.candidate_id == candidate_id)
    if job_id:
        q = q.filter(Interview.job_id == job_id)
    rows = q.order_by(Interview.scheduled_at.desc().nullslast(), Interview.created_at.desc()).all()
    return [interview_out(i) for i in rows]


@router.post("", status_code=201)
def create_interview(
    payload: InterviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(INTERVIEW_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    candidate = get_candidate(db, org_id, payload.candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    if payload.job_id is not None and get_job(db, org_id, payload.job_id) is None:
        raise HTTPException(404, "Job not found")

    row = Interview(
        organization_id=org_id,
        candidate_id=payload.candidate_id,
        job_id=payload.job_id,
        title=payload.title or "Interview",
        scheduled_at=payload.scheduled_at,
        duration_minutes=payload.duration_minutes,
        mode=payload.mode,
        location=payload.location,
        interviewer_user_id=payload.interviewer_user_id,
        created_by_user_id=user.id,
    )
    db.add(row)
    if candidate.stage in (CandidateStage.NEW, CandidateStage.PARSED, CandidateStage.IN_REVIEW):
        candidate.stage = CandidateStage.INTERVIEW
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="interview.scheduled", resource_type="interview", resource_id=None,
              details={"candidate_id": candidate.id, "mode": payload.mode.value})
    db.commit()
    db.refresh(row)
    return interview_out(row)


class BulkInterviewIn(BaseModel):
    candidate_ids: list[int] = Field(min_length=1)
    job_id: int | None = None
    title: str | None = None
    scheduled_at: datetime | None = None
    duration_minutes: int = 60
    mode: InterviewMode = InterviewMode.VIDEO
    location: str | None = None
    interviewer_user_id: int | None = None
    advance_stage: bool = True


@router.post("/bulk", status_code=201)
def bulk_create_interviews(
    payload: BulkInterviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(INTERVIEW_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    if payload.job_id is not None and get_job(db, org_id, payload.job_id) is None:
        raise HTTPException(404, "Job not found")

    created = []
    for cid in payload.candidate_ids:
        candidate = get_candidate(db, org_id, cid)
        if candidate is None:
            continue
        row = Interview(
            organization_id=org_id,
            candidate_id=cid,
            job_id=payload.job_id,
            title=payload.title or "Interview",
            scheduled_at=payload.scheduled_at,
            duration_minutes=payload.duration_minutes,
            mode=payload.mode,
            location=payload.location,
            interviewer_user_id=payload.interviewer_user_id,
            created_by_user_id=user.id,
        )
        db.add(row)
        if payload.advance_stage:
            candidate.stage = CandidateStage.INTERVIEW
        created.append(row)

    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="interview.bulk_scheduled",
        resource_type="interview",
        resource_id=None,
        details={
            "candidate_ids": payload.candidate_ids,
            "created_count": len(created),
            "job_id": payload.job_id,
        },
    )
    db.commit()
    for row in created:
        db.refresh(row)
    return {"created_count": len(created), "interviews": [interview_out(i) for i in created]}


@router.get("/{interview_id}")
def get_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(INTERVIEW_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    row = _get(db, org_id, interview_id)
    out = interview_out(row)
    out["scorecards"] = [scorecard_out(s) for s in row.scorecards]
    return out


@router.patch("/{interview_id}")
def update_interview(
    interview_id: int,
    payload: InterviewPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(INTERVIEW_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    row = _get(db, org_id, interview_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    return interview_out(row)


@router.delete("/{interview_id}", status_code=204)
def delete_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(INTERVIEW_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    row = _get(db, org_id, interview_id)
    db.delete(row)
    db.commit()


class ScorecardIn(BaseModel):
    technical: int | None = Field(default=None, ge=1, le=5)
    communication: int | None = Field(default=None, ge=1, le=5)
    culture_fit: int | None = Field(default=None, ge=1, le=5)
    overall: int | None = Field(default=None, ge=1, le=5)
    recommendation: str | None = None
    notes: str | None = None


@router.post("/{interview_id}/scorecards", status_code=201)
def submit_scorecard(
    interview_id: int,
    payload: ScorecardIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(SCORECARD_SUBMIT)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    interview = _get(db, org_id, interview_id)
    card = Scorecard(
        organization_id=org_id,
        interview_id=interview.id,
        interviewer_user_id=user.id,
        **payload.model_dump(),
    )
    db.add(card)
    if interview.status == InterviewStatus.SCHEDULED:
        interview.status = InterviewStatus.COMPLETED
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="scorecard.submitted", resource_type="interview",
              resource_id=interview.id, details={"overall": payload.overall})
    db.commit()
    db.refresh(card)
    return scorecard_out(card)


@router.get("/{interview_id}/scorecards")
def list_scorecards(
    interview_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(INTERVIEW_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    interview = _get(db, org_id, interview_id)
    return [scorecard_out(s) for s in interview.scorecards]
