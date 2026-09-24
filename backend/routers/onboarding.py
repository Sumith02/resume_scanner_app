"""Phase 4 — Onboarding checklists (created when an offer is accepted)."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.models import CandidateStage, OnboardingStatus, OnboardingTask, User, utcnow
from backend.rbac import OFFER_READ, ONBOARDING_MANAGE
from backend.repository import get_candidate, log_audit
from backend.serializers import onboarding_task_out

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


def _get(db: Session, org_id: int, task_id: int) -> OnboardingTask:
    row = (
        db.query(OnboardingTask)
        .filter(OnboardingTask.id == task_id, OnboardingTask.organization_id == org_id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Onboarding task not found")
    return row


class TaskIn(BaseModel):
    candidate_id: int
    title: str = Field(min_length=1, max_length=300)
    due_date: datetime | None = None


class TaskPatch(BaseModel):
    title: str | None = None
    status: OnboardingStatus | None = None
    due_date: datetime | None = None


@router.get("")
def list_tasks(
    candidate_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(OFFER_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    q = db.query(OnboardingTask).filter(OnboardingTask.organization_id == org_id)
    if candidate_id:
        q = q.filter(OnboardingTask.candidate_id == candidate_id)
    rows = q.order_by(OnboardingTask.created_at.asc()).all()
    return [onboarding_task_out(t) for t in rows]


@router.post("", status_code=201)
def create_task(
    payload: TaskIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(ONBOARDING_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    if get_candidate(db, org_id, payload.candidate_id) is None:
        raise HTTPException(404, "Candidate not found")
    row = OnboardingTask(organization_id=org_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return onboarding_task_out(row)


class BulkTaskItem(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    due_date: datetime | None = None


class BulkTaskIn(BaseModel):
    candidate_ids: list[int] = Field(min_length=1)
    tasks: list[BulkTaskItem] = Field(default_factory=list)
    title: str | None = None
    due_date: datetime | None = None
    advance_stage: bool = True


@router.post("/bulk", status_code=201)
def bulk_create_tasks(
    payload: BulkTaskIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(ONBOARDING_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)

    task_defs: list[tuple[str, datetime | None]] = []
    for t in payload.tasks:
        task_defs.append((t.title, t.due_date))
    if payload.title:
        task_defs.append((payload.title, payload.due_date))
    if not task_defs:
        task_defs.append(("Complete Onboarding", payload.due_date))

    created = []
    for cid in payload.candidate_ids:
        candidate = get_candidate(db, org_id, cid)
        if candidate is None:
            continue
        for title, due in task_defs:
            row = OnboardingTask(
                organization_id=org_id,
                candidate_id=cid,
                title=title,
                due_date=due,
            )
            db.add(row)
            created.append(row)
        if payload.advance_stage:
            candidate.stage = CandidateStage.ONBOARDING

    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="onboarding.bulk_tasks_created",
        resource_type="onboarding_task",
        resource_id=None,
        details={
            "candidate_ids": payload.candidate_ids,
            "created_count": len(created),
        },
    )
    db.commit()
    for row in created:
        db.refresh(row)
    return {"created_count": len(created), "tasks": [onboarding_task_out(t) for t in created]}


@router.patch("/{task_id}")
def update_task(
    task_id: int,
    payload: TaskPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(ONBOARDING_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    row = _get(db, org_id, task_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(row, field, value)
    if data.get("status") == OnboardingStatus.DONE:
        row.completed_at = utcnow()
    elif "status" in data:
        row.completed_at = None
    db.commit()
    return onboarding_task_out(row)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(ONBOARDING_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    db.delete(_get(db, org_id, task_id))
    db.commit()
