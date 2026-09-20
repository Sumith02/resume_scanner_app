"""Phase 5 — Plans, subscriptions, usage metering and invoices."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import (
    ensure_active_org,
    ensure_company_scope,
    require_permission,
)
from backend.models import (
    Invoice,
    Organization,
    Subscription,
    SubscriptionStatus,
    User,
    utcnow,
)
from backend.plans import PLANS, get_plan, plan_out, usage_summary
from backend.rbac import BILLING_MANAGE, BILLING_READ, PLAN_MANAGE
from backend.repository import active_user_count, log_audit
from backend.serializers import invoice_out, subscription_out

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _active_users(db: Session, org_id: int) -> int:
    return active_user_count(db, org_id)


def _org(db: Session, user: User) -> Organization:
    org = db.get(Organization, user.organization_id)
    if org is None:
        raise HTTPException(404, "Organization not found")
    return org


@router.get("/plans")
def list_plans(user: User = Depends(require_permission(BILLING_READ))):
    return [plan_out(code) for code in PLANS]


@router.get("/usage")
def usage(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(BILLING_READ)),
):
    ensure_company_scope(user)
    ensure_active_org(user, db)
    return usage_summary(db, _org(db, user))


@router.get("/subscription")
def get_subscription(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(BILLING_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)
    sub = (
        db.query(Subscription)
        .filter(Subscription.organization_id == org_id)
        .order_by(Subscription.created_at.desc())
        .first()
    )
    return {
        "plan": plan_out(org.plan_code),
        "subscription": subscription_out(sub) if sub else None,
        "seats": {"limit": org.seat_limit},
    }


class SubscribeIn(BaseModel):
    plan_code: str


@router.post("/subscribe")
def subscribe(
    payload: SubscribeIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(BILLING_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)
    _apply_plan(db, org, payload.plan_code, actor=user)
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="subscription.changed", resource_type="organization", resource_id=org.id,
              details={"plan_code": payload.plan_code})
    db.commit()
    return get_subscription(db=db, user=user)


@router.get("/invoices")
def list_invoices(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(BILLING_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    rows = (
        db.query(Invoice)
        .filter(Invoice.organization_id == org_id)
        .order_by(Invoice.issued_at.desc())
        .all()
    )
    return [invoice_out(i) for i in rows]


@router.post("/invoices/{invoice_id}/pay")
def pay_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(BILLING_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    inv = (
        db.query(Invoice)
        .filter(Invoice.id == invoice_id, Invoice.organization_id == org_id)
        .first()
    )
    if inv is None:
        raise HTTPException(404, "Invoice not found")
    if inv.status == "PAID":
        return invoice_out(inv)
    inv.status = "PAID"
    inv.paid_at = utcnow()
    sub = (
        db.query(Subscription)
        .filter(Subscription.organization_id == org_id)
        .order_by(Subscription.created_at.desc())
        .first()
    )
    if sub and sub.status == SubscriptionStatus.PAST_DUE:
        sub.status = SubscriptionStatus.ACTIVE
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="invoice.paid", resource_type="invoice", resource_id=inv.id)
    db.commit()
    return invoice_out(inv)


# -- Master plan assignment ----------------------------------------------

class AssignPlanIn(BaseModel):
    plan_code: str
    seat_limit: int | None = None
    feature_flags: dict | None = None


@router.post("/organizations/{org_id}/plan")
def assign_plan(
    org_id: int,
    payload: AssignPlanIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PLAN_MANAGE)),
):
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(404, "Organization not found")
    _apply_plan(db, org, payload.plan_code, actor=user, seat_limit=payload.seat_limit,
                feature_flags=payload.feature_flags)
    log_audit(db, org_id=org.id, actor_user_id=user.id, actor_email=user.email,
              action="plan.assigned", resource_type="organization", resource_id=org.id,
              details={"plan_code": payload.plan_code})
    db.commit()
    return {"organization_id": org.id, "plan_code": org.plan_code,
            "seat_limit": org.seat_limit, "feature_flags": org.feature_flags or {}}


def _apply_plan(
    db: Session,
    org: Organization,
    plan_code: str,
    *,
    actor: User,
    seat_limit: int | None = None,
    feature_flags: dict | None = None,
) -> None:
    if plan_code not in PLANS:
        raise HTTPException(422, f"Unknown plan '{plan_code}'")
    plan = get_plan(plan_code)
    org.plan_code = plan.code
    if seat_limit is not None:
        org.seat_limit = seat_limit
    else:
        # Respect approved seat bumps but never drop below users already present.
        org.seat_limit = max(plan.seat_limit, _active_users(db, org.id))
    if feature_flags is not None:
        org.feature_flags = feature_flags

    sub = (
        db.query(Subscription)
        .filter(Subscription.organization_id == org.id)
        .order_by(Subscription.created_at.desc())
        .first()
    )
    now = utcnow()
    if sub is None:
        sub = Subscription(organization_id=org.id, plan_code=plan.code, seats=org.seat_limit)
        db.add(sub)
    sub.plan_code = plan.code
    sub.seats = org.seat_limit
    sub.status = SubscriptionStatus.ACTIVE
    sub.current_period_start = now
    sub.current_period_end = now + timedelta(days=30)
    db.flush()

    if plan.price_monthly_cents > 0:
        _issue_invoice(db, org, plan.code, plan.price_monthly_cents)


def _issue_invoice(db: Session, org: Organization, plan_code: str, amount_cents: int) -> Invoice:
    plan = get_plan(plan_code)
    period = utcnow().strftime("%Y-%m")
    count = db.query(Invoice).filter(Invoice.organization_id == org.id).count()
    number = f"INV-{org.id:04d}-{period.replace('-', '')}-{count + 1:03d}"
    inv = Invoice(
        organization_id=org.id,
        number=number,
        amount_cents=amount_cents,
        status="OPEN",
        period=period,
        lines=[{"description": f"{plan.name} plan — monthly", "amount_cents": amount_cents}],
        due_at=utcnow() + timedelta(days=14),
    )
    db.add(inv)
    db.flush()
    return inv
