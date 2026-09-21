from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import require_permission
from backend.models import (
    Candidate,
    Job,
    Organization,
    OrgStatus,
    Role,
    SeatRequest,
    SeatRequestStatus,
    User,
    UserStatus,
    utcnow,
)
from backend.rbac import (
    AUDIT_READ,
    COMPANY_CREATE,
    COMPANY_MANAGE,
    SEAT_APPROVE,
    USAGE_READ,
    USER_CREATE,
)
from backend.repository import (
    active_user_count,
    get_organization,
    list_audit,
    list_organizations,
    list_users,
    log_audit,
)
from backend.routers.auth import issue_invite, send_invite_email
from backend.schemas import (
    CompanyAdminCreate,
    CompanyCreate,
    OrgStatusUpdate,
    SeatRequestReview,
    UserCreate,
)
from backend.serializers import (
    audit_out,
    org_out,
    seat_request_out,
    user_out,
)

router = APIRouter(prefix="/api/master", tags=["master"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or f"org-{datetime.now(UTC).timestamp():.0f}"


def _unique_slug(db: Session, name: str) -> str:
    base = _slugify(name)
    slug = base
    i = 1
    while db.query(Organization).filter_by(slug=slug).first():
        slug = f"{base}-{i}"
        i += 1
    return slug


def _org_with_seats(db: Session, org: Organization) -> dict:
    seats = {
        "limit": org.seat_limit,
        "used": active_user_count(db, org.id),
        "available": max(0, org.seat_limit - active_user_count(db, org.id)),
    }
    return org_out(org, seats=seats)


def _provision_company(db, master: User, name, email, seat_limit, admin: CompanyAdminCreate):
    org = Organization(
        name=name.strip(),
        slug=_unique_slug(db, name),
        email=email,
        status=OrgStatus.CREATED,
        seat_limit=seat_limit,
        created_by_user_id=master.id,
    )
    db.add(org)
    db.flush()

    admin_user = User(
        email=admin.email.lower(),
        name=admin.name,
        password_hash=None,
        organization_id=org.id,
        role=Role.COMPANY_OWNER,
        status=UserStatus.INVITED,
    )
    db.add(admin_user)
    db.flush()
    token, temp_password = issue_invite(db, admin_user)
    send_invite_email(
        to_email=admin_user.email,
        name=admin_user.name,
        temp_password=temp_password,
        token=token,
        role_label="Company Administrator",
    )

    log_audit(
        db,
        org_id=None,
        actor_user_id=master.id,
        actor_email=master.email,
        action="platform.company_created",
        resource_type="organization",
        resource_id=org.id,
        details={"name": org.name, "seat_limit": seat_limit, "admin_email": admin.email},
    )
    log_audit(
        db,
        org_id=org.id,
        actor_user_id=master.id,
        actor_email=master.email,
        action="user.invited",
        resource_type="user",
        resource_id=admin_user.id,
        details={"role": Role.COMPANY_OWNER.value, "target_org": org.name},
    )
    db.commit()

    return org, admin_user, token


@router.get("/companies")
def list_companies(
    user: User = Depends(require_permission(COMPANY_MANAGE)),
    db: Session = Depends(get_db),
):
    from backend.models import SeatRequest, SeatRequestStatus

    result = []
    for org in list_organizations(db):
        pending = (
            db.query(SeatRequest)
            .filter(
                SeatRequest.organization_id == org.id,
                SeatRequest.status == SeatRequestStatus.PENDING,
            )
            .count()
        )
        item = _org_with_seats(db, org)
        item["pending_seat_requests"] = pending
        result.append(item)
    return result


@router.post("/companies")
def create_company(
    payload: CompanyCreate,
    user: User = Depends(require_permission(COMPANY_CREATE)),
    db: Session = Depends(get_db),
):
    if payload.seat_limit < 1:
        raise HTTPException(422, "seat_limit must be >= 1")
    if not payload.email:
        raise HTTPException(422, "A company admin email is required to send the invitation")

    require_admin = CompanyAdminCreate(
        email=payload.email,
        name="Company Administrator",
        role=Role.COMPANY_OWNER,
    )
    org, admin_user, token = _provision_company(
        db, user,
        name=payload.name,
        email=payload.email,
        seat_limit=payload.seat_limit,
        admin=require_admin,
    )
    if payload.plan:
        from backend.plans import PLANS
        if payload.plan.lower() in PLANS:
            org.plan_code = payload.plan.lower()
    org.feature_flags = payload.feature_flags or {}
    org.status = OrgStatus.INVITATION_SENT
    db.commit()

    invite_link = f"INVITE_TOKEN={token} ADMIN_EMAIL={admin_user.email}"
    return {
        "message": "Company created and company admin invited",
        "company": _org_with_seats(db, org),
        "admin": user_out(admin_user),
        "invite_token": token,
        "invite_instructions": invite_link,
    }


@router.post("/companies/{org_id}/admins")
def invite_company_admin(
    org_id: int,
    payload: UserCreate,
    user: User = Depends(require_permission(USER_CREATE)),
    db: Session = Depends(get_db),
):
    org = get_organization(db, org_id)
    if org is None:
        raise HTTPException(404, "Company not found")
    if payload.role not in (Role.COMPANY_OWNER, Role.COMPANY_ADMIN):
        raise HTTPException(422, "Only COMPANY_OWNER or COMPANY_ADMIN can be invited at company level")

    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(409, "A user with this email already exists")

    seat_ok = active_user_count(db, org.id) < org.seat_limit
    if not seat_ok:
        raise HTTPException(
            402,
            "Seat limit reached. Submit a seat request for review.",
        )

    new_user = User(
        email=payload.email.lower(),
        name=payload.name,
        password_hash=None,
        organization_id=org.id,
        role=payload.role,
        status=UserStatus.INVITED,
    )
    db.add(new_user)
    db.flush()
    token, temp_password = issue_invite(db, new_user)
    send_invite_email(
        to_email=new_user.email,
        name=new_user.name,
        temp_password=temp_password,
        token=token,
        role_label=payload.role.value.replace("_", " ").title(),
    )
    log_audit(
        db,
        org_id=None,
        actor_user_id=user.id,
        actor_email=user.email,
        action="platform.user_invited",
        resource_type="user",
        resource_id=new_user.id,
        details={"role": payload.role.value, "target_org": org.name},
    )
    db.commit()
    return {
        "message": "Company admin invited",
        "user": user_out(new_user),
        "invite_token": token,
    }


@router.patch("/companies/{org_id}/status")
def update_company_status(
    org_id: int,
    payload: OrgStatusUpdate,
    user: User = Depends(require_permission(COMPANY_MANAGE)),
    db: Session = Depends(get_db),
):
    org = get_organization(db, org_id)
    if org is None:
        raise HTTPException(404, "Company not found")
    try:
        new_status = OrgStatus(payload.status)
    except ValueError:
        raise HTTPException(422, f"Invalid status. Choose from {[s.value for s in OrgStatus]}")

    if new_status == OrgStatus.DEACTIVATED:
        # Deactivation is a controlled lifecycle state, not a delete.
        for u in list_users(db, org.id):
            u.status = UserStatus.INACTIVE

    previous_status = org.status.value
    org.status = new_status
    log_audit(
        db,
        org_id=None,
        actor_user_id=user.id,
        actor_email=user.email,
        action="platform.company_status_changed",
        resource_type="organization",
        resource_id=org.id,
        details={"from": previous_status, "to": new_status.value},
    )
    db.commit()
    return {"message": "Company status updated", "company": _org_with_seats(db, org)}


@router.get("/seat-requests")
def list_seat_requests(
    status: str | None = Query(None),
    user: User = Depends(require_permission(SEAT_APPROVE)),
    db: Session = Depends(get_db),
):
    q = db.query(SeatRequest).order_by(SeatRequest.created_at.desc())
    if status:
        q = q.filter(SeatRequest.status == SeatRequestStatus(status))
    items = q.all()
    orgs = {o.id: o for o in db.query(Organization).all()}
    return [
        {
            **seat_request_out(sr),
            "company_name": orgs[sr.organization_id].name if sr.organization_id in orgs else None,
        }
        for sr in items
    ]


@router.post("/seat-requests/{req_id}/review")
def review_seat_request(
    req_id: int,
    payload: SeatRequestReview,
    user: User = Depends(require_permission(SEAT_APPROVE)),
    db: Session = Depends(get_db),
):
    sr = db.get(SeatRequest, req_id)
    if sr is None:
        raise HTTPException(404, "Seat request not found")
    if sr.status != SeatRequestStatus.PENDING:
        raise HTTPException(409, "Seat request already reviewed")

    sr.status = SeatRequestStatus.APPROVED if payload.approve else SeatRequestStatus.REJECTED
    sr.reviewed_by_user_id = user.id
    sr.reviewed_at = utcnow()

    org = get_organization(db, sr.organization_id)
    if payload.approve and org is not None:
        org.seat_limit = sr.requested_seats

    log_audit(
        db,
        org_id=sr.organization_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="seat.request_reviewed",
        resource_type="organization",
        resource_id=sr.organization_id,
        details={
            "approve": payload.approve,
            "from": sr.current_seats,
            "to": sr.requested_seats,
            "reason": payload.reason,
        },
    )
    db.commit()
    return {"message": "Seat request reviewed", "seat_request": seat_request_out(sr)}


@router.get("/audit")
def master_audit(
    org_id: int | None = None,
    action: str | None = None,
    limit: int = Query(200, le=500),
    user: User = Depends(require_permission(AUDIT_READ)),
    db: Session = Depends(get_db),
):
    return [audit_out(a) for a in list_audit(db, org_id=None, action=action, limit=limit)]


@router.get("/stats")
def master_stats(
    user: User = Depends(require_permission(USAGE_READ)),
    db: Session = Depends(get_db),
):
    orgs = list_organizations(db)
    total_seats = sum(o.seat_limit for o in orgs)
    org_ids = [o.id for o in orgs]
    total_users = (
        db.query(User).filter(User.organization_id.in_(org_ids)).count() if org_ids else 0
    )
    total_jobs = (
        db.query(Job).filter(Job.organization_id.in_(org_ids)).count() if org_ids else 0
    )
    total_candidates = (
        db.query(Candidate).filter(Candidate.organization_id.in_(org_ids)).count()
        if org_ids
        else 0
    )
    status_breakdown = {}
    for o in orgs:
        key = o.status.value if hasattr(o.status, "value") else o.status
        status_breakdown[key] = status_breakdown.get(key, 0) + 1
    return {
        "organizations": len(orgs),
        "total_seats": total_seats,
        "total_users": total_users,
        "total_jobs": total_jobs,
        "total_candidates": total_candidates,
        "status_breakdown": status_breakdown,
    }
