from __future__ import annotations

from backend.models import (
    AuditLog,
    Candidate,
    Job,
    Note,
    Organization,
    SeatRequest,
    Tag,
    User,
)


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def user_out(u: User) -> dict:
    from backend.rbac import permissions_for

    role_value = u.role.value if hasattr(u.role, "value") else u.role
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "role": role_value,
        "status": u.status.value if hasattr(u.status, "value") else u.status,
        "organization_id": u.organization_id,
        "scope": u.scope,
        "permissions": permissions_for(u.role),
        "invited": u.status.value == "INVITED" if hasattr(u.status, "value") else u.status == "INVITED",
        "must_change_password": bool(getattr(u, "must_change_password", False)),
        "last_login_at": _iso(u.last_login_at),
        "created_at": _iso(u.created_at),
    }


def org_out(o: Organization, seats: dict | None = None) -> dict:
    return {
        "id": o.id,
        "name": o.name,
        "slug": o.slug,
        "email": o.email,
        "status": o.status.value if hasattr(o.status, "value") else o.status,
        "seat_limit": o.seat_limit,
        "plan_code": getattr(o, "plan_code", None) or "starter",
        "feature_flags": o.feature_flags or {},
        "seats": seats,
        "created_by_user_id": o.created_by_user_id,
        "created_at": _iso(o.created_at),
    }


def seat_request_out(sr: SeatRequest) -> dict:
    return {
        "id": sr.id,
        "organization_id": sr.organization_id,
        "current_seats": sr.current_seats,
        "requested_seats": sr.requested_seats,
        "reason": sr.reason,
        "status": sr.status.value if hasattr(sr.status, "value") else sr.status,
        "requested_by_user_id": sr.requested_by_user_id,
        "reviewed_by_user_id": sr.reviewed_by_user_id,
        "reviewed_at": _iso(sr.reviewed_at),
        "created_at": _iso(sr.created_at),
    }


def job_out(j: Job) -> dict:
    return {
        "id": j.id,
        "organization_id": j.organization_id,
        "title": j.title,
        "client_name": j.client_name,
        "department": j.department,
        "location": j.location,
        "employment_type": j.employment_type,
        "status": j.status.value if hasattr(j.status, "value") else j.status,
        "salary_range": j.salary_range,
        "requirements": j.requirements,
        "skills": j.skills or [],
        "created_by_user_id": j.created_by_user_id,
        "created_at": _iso(j.created_at),
        "updated_at": _iso(j.updated_at),
    }


def candidate_out(c: Candidate, tags: list | None = None) -> dict:
    return {
        "id": c.id,
        "organization_id": c.organization_id,
        "name": c.name,
        "email": c.email,
        "phone": c.phone,
        "current_title": c.current_title,
        "current_company": c.current_company,
        "location": c.location,
        "summary": c.summary,
        "skills": c.skills or [],
        "experience_years": c.experience_years,
        "education": c.education or [],
        "has_resume": bool(c.resume_path),
        "resume_filename": c.resume_filename,
        "source": c.source.value if hasattr(c.source, "value") else c.source,
        "stage": c.stage.value if hasattr(c.stage, "value") else c.stage,
        "duplicate_of_id": c.duplicate_of_id,
        "matched_job_ids": c.matched_job_ids or [],
        "created_by_user_id": c.created_by_user_id,
        "created_at": _iso(c.created_at),
        "updated_at": _iso(c.updated_at),
        "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in (tags or c.tags)],
    }


def note_out(n: Note) -> dict:
    return {
        "id": n.id,
        "candidate_id": n.candidate_id,
        "author_user_id": n.author_user_id,
        "author_name": n.author.name if n.author else None,
        "body": n.body,
        "created_at": _iso(n.created_at),
    }


def tag_out(t: Tag) -> dict:
    return {
        "id": t.id,
        "organization_id": t.organization_id,
        "name": t.name,
        "color": t.color,
        "created_at": _iso(t.created_at),
    }


def audit_out(a: AuditLog) -> dict:
    return {
        "id": a.id,
        "organization_id": a.organization_id,
        "actor_user_id": a.actor_user_id,
        "actor_email": a.actor_email,
        "action": a.action,
        "resource_type": a.resource_type,
        "resource_id": a.resource_id,
        "details": a.details or {},
        "created_at": _iso(a.created_at),
    }


# ---------------------------------------------------------------------------
# Phase 3 — Intelligence
# ---------------------------------------------------------------------------

def talent_pool_out(pool, member_count: int | None = None) -> dict:
    return {
        "id": pool.id,
        "organization_id": pool.organization_id,
        "name": pool.name,
        "description": pool.description,
        "is_shared": pool.is_shared,
        "member_count": member_count if member_count is not None else len(pool.members or []),
        "created_by_user_id": pool.created_by_user_id,
        "created_at": _iso(pool.created_at),
        "updated_at": _iso(pool.updated_at),
    }


def saved_search_out(s) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "criteria": s.criteria or {},
        "created_by_user_id": s.created_by_user_id,
        "created_at": _iso(s.created_at),
    }


# ---------------------------------------------------------------------------
# Phase 4 — Operations
# ---------------------------------------------------------------------------

def interview_out(i, scorecards: list | None = None) -> dict:
    cards = scorecards if scorecards is not None else list(i.scorecards or [])
    ratings = [c.overall for c in cards if c.overall]
    return {
        "id": i.id,
        "organization_id": i.organization_id,
        "candidate_id": i.candidate_id,
        "job_id": i.job_id,
        "title": i.title,
        "scheduled_at": _iso(i.scheduled_at),
        "duration_minutes": i.duration_minutes,
        "mode": i.mode.value if hasattr(i.mode, "value") else i.mode,
        "location": i.location,
        "status": i.status.value if hasattr(i.status, "value") else i.status,
        "interviewer_user_id": i.interviewer_user_id,
        "scorecard_count": len(cards),
        "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "created_at": _iso(i.created_at),
        "updated_at": _iso(i.updated_at),
    }


def scorecard_out(s) -> dict:
    return {
        "id": s.id,
        "interview_id": s.interview_id,
        "interviewer_user_id": s.interviewer_user_id,
        "technical": s.technical,
        "communication": s.communication,
        "culture_fit": s.culture_fit,
        "overall": s.overall,
        "recommendation": s.recommendation,
        "notes": s.notes,
        "created_at": _iso(s.created_at),
    }


def offer_out(o) -> dict:
    return {
        "id": o.id,
        "organization_id": o.organization_id,
        "candidate_id": o.candidate_id,
        "job_id": o.job_id,
        "salary": o.salary,
        "currency": o.currency,
        "employment_type": o.employment_type,
        "start_date": _iso(o.start_date),
        "status": o.status.value if hasattr(o.status, "value") else o.status,
        "notes": o.notes,
        "created_at": _iso(o.created_at),
        "updated_at": _iso(o.updated_at),
    }


def onboarding_task_out(t) -> dict:
    return {
        "id": t.id,
        "organization_id": t.organization_id,
        "candidate_id": t.candidate_id,
        "title": t.title,
        "status": t.status.value if hasattr(t.status, "value") else t.status,
        "due_date": _iso(t.due_date),
        "completed_at": _iso(t.completed_at),
        "created_at": _iso(t.created_at),
    }


def email_template_out(t) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "subject": t.subject,
        "body": t.body,
        "created_at": _iso(t.created_at),
    }


def email_message_out(m) -> dict:
    return {
        "id": m.id,
        "candidate_id": m.candidate_id,
        "template_id": m.template_id,
        "to_email": m.to_email,
        "subject": m.subject,
        "body": m.body,
        "status": m.status,
        "provider": m.provider,
        "error": m.error,
        "sent_at": _iso(m.sent_at),
        "created_at": _iso(m.created_at),
    }


def email_account_out(a) -> dict:
    return {
        "id": a.id,
        "provider": a.provider,
        "email": a.email,
        "status": a.status,
        "is_demo": a.is_demo,
        "history_id": a.history_id,
        "last_sync_at": _iso(a.last_sync_at),
        "last_sync_summary": a.last_sync_summary or {},
        "connected_by_user_id": a.connected_by_user_id,
        "created_at": _iso(a.created_at),
    }


# ---------------------------------------------------------------------------
# Phase 5 — SaaS
# ---------------------------------------------------------------------------

def subscription_out(s) -> dict:
    return {
        "id": s.id,
        "organization_id": s.organization_id,
        "plan_code": s.plan_code,
        "status": s.status.value if hasattr(s.status, "value") else s.status,
        "seats": s.seats,
        "current_period_start": _iso(s.current_period_start),
        "current_period_end": _iso(s.current_period_end),
        "cancel_at_period_end": s.cancel_at_period_end,
        "created_at": _iso(s.created_at),
    }


def invoice_out(i) -> dict:
    return {
        "id": i.id,
        "organization_id": i.organization_id,
        "number": i.number,
        "amount_cents": i.amount_cents,
        "currency": i.currency,
        "status": i.status,
        "lines": i.lines or [],
        "period": i.period,
        "issued_at": _iso(i.issued_at),
        "due_at": _iso(i.due_at),
        "paid_at": _iso(i.paid_at),
    }


def portal_token_out(t, include_secret: str | None = None) -> dict:
    out = {
        "id": t.id,
        "client_name": t.client_name,
        "job_ids": t.job_ids or [],
        "can_view_candidates": t.can_view_candidates,
        "is_active": t.is_active,
        "expires_at": _iso(t.expires_at),
        "last_viewed_at": _iso(t.last_viewed_at),
        "created_at": _iso(t.created_at),
    }
    if include_secret:
        out["token"] = include_secret
    return out