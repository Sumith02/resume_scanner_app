from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.models import Candidate, Job, Organization, User, UserStatus
from backend.rbac import (
    AUDIT_READ,
    COMPANY_ROLES,
    SEAT_REQUEST,
    USAGE_READ,
    USER_CREATE,
    USER_MANAGE,
)
from backend.repository import (
    active_user_count,
    get_user_in_org,
    list_audit,
    list_users,
    log_audit,
)
from backend.routers.auth import issue_invite, send_invite_email
from backend.schemas import SeatRequestCreate, UserCreate, UserUpdate
from backend.serializers import audit_out, user_out

router = APIRouter(prefix="/api/org", tags=["org"])


def _org(db: Session, org_id: int) -> Organization:
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(404, "Organization not found")
    return org


def _seats(db: Session, org_id: int) -> dict:
    org = _org(db, org_id)
    used = active_user_count(db, org_id)
    return {
        "limit": org.seat_limit,
        "used": used,
        "available": max(0, org.seat_limit - used),
    }


@router.get("/seats")
def get_seats(
    user: User = Depends(require_permission(USAGE_READ)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    return _seats(db, org_id)


@router.get("/usage")
def get_usage(
    user: User = Depends(require_permission(USAGE_READ)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    org = _org(db, org_id)
    return {
        "seats": _seats(db, org_id),
        "jobs": db.query(Job).filter(Job.organization_id == org_id).count(),
        "active_jobs": db.query(Job).filter(Job.organization_id == org_id, Job.status == "OPEN").count(),
        "candidates": db.query(Candidate).filter(Candidate.organization_id == org_id).count(),
        "users": db.query(User).filter(User.organization_id == org_id).count(),
        "plan": org.feature_flags or {},
    }


@router.post("/seats/request")
def request_seats(
    payload: SeatRequestCreate,
    user: User = Depends(require_permission(SEAT_REQUEST)),
    db: Session = Depends(get_db),
):
    from backend.models import SeatRequest, SeatRequestStatus

    org_id = ensure_company_scope(user)
    org = _org(db, org_id)
    current = active_user_count(db, org_id)
    requested = org.seat_limit + 1
    pending = (
        db.query(SeatRequest)
        .filter(
            SeatRequest.organization_id == org_id,
            SeatRequest.status == SeatRequestStatus.PENDING,
        )
        .first()
    )
    if pending:
        raise HTTPException(409, "A seat request is already pending review")
    sr = SeatRequest(
        organization_id=org_id,
        current_seats=current,
        requested_seats=requested,
        reason=payload.reason,
        status=SeatRequestStatus.PENDING,
        requested_by_user_id=user.id,
    )
    db.add(sr)
    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="seat.requested",
        resource_type="organization",
        resource_id=org_id,
        details={"current": current, "requested": requested},
    )
    db.commit()
    return {
        "message": "Seat request submitted for review",
        "current": current,
        "requested": requested,
    }


@router.get("/users")
def get_users(
    user: User = Depends(require_permission(USER_MANAGE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    rows = list_users(db, org_id)
    out = []
    for u in rows:
        item = user_out(u)
        item["seats"] = _seats(db, org_id)
        out.append(item)
    return out


@router.post("/users")
def create_user(
    payload: UserCreate,
    user: User = Depends(require_permission(USER_CREATE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    org = _org(db, org_id)
    ensure_active_org(user, db)

    if payload.role not in COMPANY_ROLES:
        raise HTTPException(422, "Not a company role")
    # Only owners/admins may provision users; the permission gate already
    # ensures this (USER_CREATE is only granted to owner/admin).

    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(409, "A user with this email already exists")

    used = active_user_count(db, org_id)
    # Seats are enforced server-side (rule 8).
    if used >= org.seat_limit:
        raise HTTPException(
            402,
            "Seat limit reached. Submit a seat request for master admin review.",
        )

    new_user = User(
        email=payload.email.lower(),
        name=payload.name,
        password_hash=None,
        organization_id=org_id,
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
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="user.invited",
        resource_type="user",
        resource_id=new_user.id,
        details={"role": payload.role.value, "seats_used_after": used + 1},
    )
    db.commit()
    return {
        "message": "User invited",
        "user": user_out(new_user),
        "invite_token": token,
        "seats": _seats(db, org_id),
    }


@router.patch("/users/{target_id}")
def update_user(
    target_id: int,
    payload: UserUpdate,
    user: User = Depends(require_permission(USER_MANAGE)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    target = get_user_in_org(db, org_id, target_id)
    if target is None:
        raise HTTPException(404, "User not found")
    if target.id == user.id:
        raise HTTPException(400, "You cannot manage your own account here")

    if payload.role is not None and payload.role != target.role:
        if payload.role not in COMPANY_ROLES:
            raise HTTPException(422, "Not a company role")
        target.role = payload.role
    if payload.name:
        target.name = payload.name
    if payload.status is not None:
        try:
            new_status = UserStatus(payload.status)
        except ValueError:
            raise HTTPException(422, f"Invalid status: {payload.status}")
        if new_status == UserStatus.INACTIVE:
            # Deactivation preserves historical activity (rules 6 & 7).
            target.status = UserStatus.INACTIVE
        elif new_status == UserStatus.SUSPENDED:
            target.status = UserStatus.SUSPENDED
        elif new_status == UserStatus.ACTIVE:
            target.status = UserStatus.ACTIVE
        elif new_status == UserStatus.REACTIVATED:
            target.status = UserStatus.REACTIVATED
        else:
            raise HTTPException(422, f"Cannot set status to {payload.status} here")

    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="user.updated",
        resource_type="user",
        resource_id=target.id,
        details={
            "role": target.role.value if hasattr(target.role, "value") else target.role,
            "status": target.status.value if hasattr(target.status, "value") else target.status,
        },
    )
    db.commit()
    return user_out(target)


@router.get("/audit")
def org_audit(
    action: str | None = None,
    limit: int = Query(200, le=500),
    user: User = Depends(require_permission(AUDIT_READ)),
    db: Session = Depends(get_db),
):
    org_id = ensure_company_scope(user)
    return [audit_out(a) for a in list_audit(db, org_id=org_id, action=action, limit=limit)]