"""Tenant-safe repository.

THE TENANT BOUNDARY LIVES HERE. Every read/write that touches a
company-owned record takes the authenticated user and hard-codes
`organization_id == user.organization_id` into the query. No endpoint
may ever let a client-supplied organization_id select a different
tenant's rows.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Text, func, or_
from sqlalchemy.orm import Session

from backend.models import (
    Candidate,
    Job,
    Note,
    Organization,
    Tag,
    User,
    UserStatus,
)

_JSON_LIKE_COLS = {"skills", "matched_job_ids", "feature_flags"}


def active_user_count(db: Session, org_id: int) -> int:
    return (
        db.query(func.count(User.id))
        .filter(
            User.organization_id == org_id,
            User.status.in_([UserStatus.ACTIVE, UserStatus.INVITED, UserStatus.SUSPENDED]),
        )
        .scalar()
        or 0
    )


def is_within_seat_limit(db: Session, org_id: int) -> bool:
    org = db.get(Organization, org_id)
    if org is None:
        return False
    return active_user_count(db, org_id) < org.seat_limit


def organization_seats(db: Session, org_id: int) -> dict:
    org = db.get(Organization, org_id)
    used = active_user_count(db, org_id)
    return {
        "limit": org.seat_limit if org else 0,
        "used": used,
        "available": max(0, (org.seat_limit if org else 0) - used),
    }


# -- Users ----------------------------------------------------------------

def list_users(db: Session, org_id: int) -> list[User]:
    return (
        db.query(User)
        .filter(User.organization_id == org_id)
        .order_by(User.created_at.desc())
        .all()
    )


def get_user_in_org(db: Session, org_id: int, user_id: int) -> User | None:
    return (
        db.query(User)
        .filter(User.id == user_id, User.organization_id == org_id)
        .first()
    )


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(func.lower(User.email) == email.lower()).first()


# -- Organizations --------------------------------------------------------

def list_organizations(db: Session) -> list[Organization]:
    return db.query(Organization).order_by(Organization.created_at.desc()).all()


def get_organization(db: Session, org_id: int) -> Organization | None:
    return db.get(Organization, org_id)


# -- Jobs -----------------------------------------------------------------

def list_jobs(db: Session, org_id: int, status: str | None = None) -> list:
    q = db.query(Job).filter(Job.organization_id == org_id)
    if status:
        q = q.filter(Job.status == status)
    return q.order_by(Job.created_at.desc()).all()


def get_job(db: Session, org_id: int, job_id: int) -> Job | None:
    return (
        db.query(Job)
        .filter(Job.id == job_id, Job.organization_id == org_id)
        .first()
    )


# -- Candidates -----------------------------------------------------------

CANDIDATE_FIELDS = [c.name for c in Candidate.__table__.columns]


def _wildcard(q: str) -> str:
    return f"%{q}%"


def list_candidates(
    db: Session,
    org_id: int,
    stage: str | None = None,
    job_id: int | None = None,
    query: str | None = None,
    tag_id: int | None = None,
    limit: int = 200,
) -> list[Candidate]:
    q = db.query(Candidate).filter(Candidate.organization_id == org_id)
    if stage:
        q = q.filter(Candidate.stage == stage)
    if job_id:
        q = q.filter(
            func.cast(Candidate.matched_job_ids, Text).like(f"%{job_id}%")
        )
    if tag_id:
        q = q.filter(Candidate.tags.any(Tag.id == tag_id))
    if query:
        like = _wildcard(query)
        q = q.filter(
            or_(
                Candidate.name.ilike(like),
                Candidate.email.ilike(like),
                Candidate.phone.ilike(like),
                Candidate.current_title.ilike(like),
                Candidate.current_company.ilike(like),
                Candidate.summary.ilike(like),
                Candidate.resume_text.ilike(like),
            )
        )
    return q.order_by(Candidate.created_at.desc()).limit(limit).all()


def get_candidate(db: Session, org_id: int, candidate_id: int) -> Candidate | None:
    return (
        db.query(Candidate)
        .filter(Candidate.id == candidate_id, Candidate.organization_id == org_id)
        .first()
    )


# -- Notes ----------------------------------------------------------------

def list_notes(db: Session, org_id: int, candidate_id: int) -> list[Note]:
    return (
        db.query(Note)
        .filter(
            Note.organization_id == org_id,
            Note.candidate_id == candidate_id,
        )
        .order_by(Note.created_at.desc())
        .all()
    )


# -- Tags -----------------------------------------------------------------

def list_tags(db: Session, org_id: int) -> list[Tag]:
    return (
        db.query(Tag)
        .filter(Tag.organization_id == org_id)
        .order_by(Tag.name.asc())
        .all()
    )


# -- Audit ----------------------------------------------------------------

def log_audit(
    db: Session,
    *,
    org_id: int | None,
    actor_user_id: int,
    actor_email: str,
    action: str,
    resource_type: str | None = None,
    resource_id: int | None = None,
    details: dict | None = None,
) -> None:
    from backend.models import AuditLog

    db.add(
        AuditLog(
            organization_id=org_id,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=_json_safe(details or {}),
        )
    )


def list_audit(
    db: Session,
    org_id: int | None,
    actor_user_id: int | None = None,
    action: str | None = None,
    limit: int = 200,
) -> list:
    from backend.models import AuditLog

    q = db.query(AuditLog)
    if org_id is not None:
        q = q.filter(AuditLog.organization_id == org_id)
    if actor_user_id:
        q = q.filter(AuditLog.actor_user_id == actor_user_id)
    if action:
        q = q.filter(AuditLog.action == action)
    return q.order_by(AuditLog.created_at.desc()).limit(limit).all()


# -- duplicates -----------------------------------------------------------

def find_dup_candidates(
    db: Session, org_id: int, email: str | None, phone: str | None, name: str | None
) -> list[Candidate]:
    q = db.query(Candidate).filter(Candidate.organization_id == org_id)
    conds = []
    if email:
        conds.append(Candidate.email.ilike(email.strip()))
    if phone:
        conds.append(Candidate.phone == phone.strip())
    if name:
        conds.append(Candidate.name.ilike(name.strip()))
    if not conds:
        return []
    q = q.filter(or_(*conds))
    return q.limit(20).all()


def _json_safe(value):
    import json

    def _clean(o):
        if isinstance(o, datetime):
            return o.isoformat()
        return o

    return json.loads(json.dumps(value, default=_clean))