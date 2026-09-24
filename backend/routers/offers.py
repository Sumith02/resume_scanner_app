"""Phase 4 — Offers."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.models import (
    CandidateStage,
    Offer,
    OfferStatus,
    OnboardingTask,
    User,
)
from backend.rbac import OFFER_MANAGE, OFFER_READ
from backend.repository import get_candidate, get_job, log_audit
from backend.serializers import offer_out

router = APIRouter(prefix="/api/offers", tags=["offers"])

DEFAULT_ONBOARDING = [
    "Sign offer letter and contract",
    "Complete background check",
    "Collect ID and tax documents",
    "Set up payroll and benefits",
    "Provision email and equipment",
    "Schedule first-day orientation",
]


def _get(db: Session, org_id: int, offer_id: int) -> Offer:
    row = (
        db.query(Offer)
        .filter(Offer.id == offer_id, Offer.organization_id == org_id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Offer not found")
    return row


class OfferIn(BaseModel):
    candidate_id: int
    job_id: int | None = None
    salary: int | None = None
    currency: str = "USD"
    employment_type: str | None = None
    start_date: datetime | None = None
    notes: str | None = None


class OfferPatch(BaseModel):
    salary: int | None = None
    currency: str | None = None
    employment_type: str | None = None
    start_date: datetime | None = None
    notes: str | None = None
    status: OfferStatus | None = None


@router.get("")
def list_offers(
    status: str | None = None,
    candidate_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(OFFER_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    q = db.query(Offer).filter(Offer.organization_id == org_id)
    if status:
        q = q.filter(Offer.status == status)
    if candidate_id:
        q = q.filter(Offer.candidate_id == candidate_id)
    rows = q.order_by(Offer.created_at.desc()).all()
    return [offer_out(o) for o in rows]


@router.post("", status_code=201)
def create_offer(
    payload: OfferIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(OFFER_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    candidate = get_candidate(db, org_id, payload.candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    if payload.job_id is not None and get_job(db, org_id, payload.job_id) is None:
        raise HTTPException(404, "Job not found")

    row = Offer(organization_id=org_id, created_by_user_id=user.id, **payload.model_dump())
    db.add(row)
    candidate.stage = CandidateStage.OFFER
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="offer.created", resource_type="offer", resource_id=None,
              details={"candidate_id": candidate.id, "salary": payload.salary})
    db.commit()
    db.refresh(row)
    return offer_out(row)


class BulkOfferIn(BaseModel):
    candidate_ids: list[int] = Field(min_length=1)
    job_id: int | None = None
    salary: float | None = None
    currency: str = "USD"
    employment_type: str | None = "FULL_TIME"
    start_date: datetime | None = None
    notes: str | None = None
    status: OfferStatus = OfferStatus.DRAFT
    advance_stage: bool = True


@router.post("/bulk", status_code=201)
def bulk_create_offers(
    payload: BulkOfferIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(OFFER_MANAGE)),
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
        row = Offer(
            organization_id=org_id,
            candidate_id=cid,
            job_id=payload.job_id,
            salary=payload.salary,
            currency=payload.currency,
            employment_type=payload.employment_type,
            start_date=payload.start_date,
            notes=payload.notes,
            status=payload.status,
            created_by_user_id=user.id,
        )
        db.add(row)
        if payload.advance_stage:
            candidate.stage = CandidateStage.OFFER
        created.append(row)

    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="offer.bulk_created",
        resource_type="offer",
        resource_id=None,
        details={
            "candidate_ids": payload.candidate_ids,
            "created_count": len(created),
            "job_id": payload.job_id,
            "salary": payload.salary,
        },
    )
    db.commit()
    for row in created:
        db.refresh(row)
    return {"created_count": len(created), "offers": [offer_out(o) for o in created]}


@router.get("/{offer_id}")
def get_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(OFFER_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    return offer_out(_get(db, org_id, offer_id))


@router.patch("/{offer_id}")
def update_offer(
    offer_id: int,
    payload: OfferPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(OFFER_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    row = _get(db, org_id, offer_id)
    data = payload.model_dump(exclude_unset=True)
    new_status = data.pop("status", None)
    for field, value in data.items():
        setattr(row, field, value)
    if new_status is not None:
        _apply_status(db, org_id, row, new_status, user)
    db.commit()
    db.refresh(row)
    return offer_out(row)


class StatusIn(BaseModel):
    status: OfferStatus


@router.post("/{offer_id}/status")
def set_status(
    offer_id: int,
    payload: StatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(OFFER_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    row = _get(db, org_id, offer_id)
    _apply_status(db, org_id, row, payload.status, user)
    db.commit()
    db.refresh(row)
    return offer_out(row)


@router.delete("/{offer_id}", status_code=204)
def delete_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(OFFER_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    db.delete(_get(db, org_id, offer_id))
    db.commit()


def _apply_status(db: Session, org_id: int, offer: Offer, status: OfferStatus, user: User) -> None:
    offer.status = status
    candidate = get_candidate(db, org_id, offer.candidate_id)
    if candidate is None:
        return
    if status == OfferStatus.ACCEPTED:
        candidate.stage = CandidateStage.PLACED
        _ensure_onboarding(db, org_id, candidate.id)
    elif status == OfferStatus.DECLINED:
        candidate.stage = CandidateStage.REJECTED
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action=f"offer.{status.value.lower()}", resource_type="offer",
              resource_id=offer.id, details={"candidate_id": offer.candidate_id})


def _ensure_onboarding(db: Session, org_id: int, candidate_id: int) -> None:
    existing = (
        db.query(OnboardingTask)
        .filter(OnboardingTask.organization_id == org_id,
                OnboardingTask.candidate_id == candidate_id)
        .count()
    )
    if existing:
        return
    for title in DEFAULT_ONBOARDING:
        db.add(OnboardingTask(organization_id=org_id, candidate_id=candidate_id, title=title))
