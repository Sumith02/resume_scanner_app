"""Phase 5 — Advanced analytics (tenant + platform-wide)."""
from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.models import (
    Candidate,
    CandidateStage,
    Interview,
    Job,
    Offer,
    Organization,
    User,
)
from backend.plans import get_plan
from backend.rbac import ANALYTICS_READ, PLATFORM_MANAGE

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

FUNNEL_ORDER = [
    CandidateStage.NEW,
    CandidateStage.PARSED,
    CandidateStage.IN_REVIEW,
    CandidateStage.SHORTLISTED,
    CandidateStage.INTERVIEW,
    CandidateStage.OFFER,
    CandidateStage.ONBOARDING,
    CandidateStage.PLACED,
]


def _value(enum_or_str) -> str:
    return enum_or_str.value if hasattr(enum_or_str, "value") else str(enum_or_str)


@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(ANALYTICS_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)

    candidates = db.query(Candidate).filter(Candidate.organization_id == org_id).all()
    jobs = db.query(Job).filter(Job.organization_id == org_id).all()
    interviews = db.query(Interview).filter(Interview.organization_id == org_id).all()
    offers = db.query(Offer).filter(Offer.organization_id == org_id).all()

    stage_counts = Counter(_value(c.stage) for c in candidates)
    funnel = [{"stage": _value(s), "count": stage_counts.get(_value(s), 0)} for s in FUNNEL_ORDER]
    funnel.extend(
        {"stage": _value(s), "count": stage_counts.get(_value(s), 0)}
        for s in (CandidateStage.REJECTED,)
    )

    total = len(candidates) or 1
    conversion = {
        "in_review": round(stage_counts.get("IN_REVIEW", 0) / total * 100, 1),
        "shortlisted": round(stage_counts.get("SHORTLISTED", 0) / total * 100, 1),
        "interview": round(stage_counts.get("INTERVIEW", 0) / total * 100, 1),
        "offer": round(stage_counts.get("OFFER", 0) / total * 100, 1),
        "placed": round(stage_counts.get("PLACED", 0) / total * 100, 1),
    }

    source_counts = Counter(_value(c.source) for c in candidates)
    skills = Counter()
    for c in candidates:
        for s in c.skills or []:
            skills[s.lower()] += 1

    offer_status = Counter(_value(o.status) for o in offers)
    accepted = offer_status.get("ACCEPTED", 0)
    acceptance_rate = round(accepted / len(offers) * 100, 1) if offers else 0.0

    interviewer_load = Counter(
        i.interviewer_user_id for i in interviews if i.interviewer_user_id
    )

    user_ids = {c.created_by_user_id for c in candidates if c.created_by_user_id}
    names = {}
    if user_ids:
        for u in db.query(User).filter(User.id.in_(user_ids)).all():
            names[u.id] = u.name or u.email
    recruiter_perf = Counter(c.created_by_user_id for c in candidates if c.created_by_user_id)

    job_perf = []
    for j in jobs:
        jc = [c for c in candidates if j.id in (c.matched_job_ids or [])]
        jo = [o for o in offers if o.job_id == j.id]
        job_perf.append({
            "job_id": j.id,
            "title": j.title,
            "status": _value(j.status),
            "candidates": len(jc),
            "offers": len(jo),
            "hires": sum(1 for o in jo if _value(o.status) == "ACCEPTED"),
        })
    job_perf.sort(key=lambda x: x["candidates"], reverse=True)

    return {
        "totals": {
            "candidates": len(candidates),
            "jobs": len(jobs),
            "open_jobs": sum(1 for j in jobs if _value(j.status) == "OPEN"),
            "interviews": len(interviews),
            "offers": len(offers),
            "hires": stage_counts.get("PLACED", 0),
            "duplicates": sum(1 for c in candidates if c.duplicate_of_id),
        },
        "funnel": funnel,
        "conversion": conversion,
        "sources": [{"source": k, "count": v} for k, v in source_counts.most_common()],
        "top_skills": [{"skill": k, "count": v} for k, v in skills.most_common(15)],
        "offers": {
            "by_status": [{"status": k, "count": v} for k, v in offer_status.items()],
            "acceptance_rate": acceptance_rate,
        },
        "interview_load": [
            {"user_id": uid, "name": names.get(uid, f"User {uid}"), "count": cnt}
            for uid, cnt in interviewer_load.most_common(10)
        ],
        "recruiter_performance": [
            {"user_id": uid, "name": names.get(uid, f"User {uid}"), "candidates": cnt}
            for uid, cnt in recruiter_perf.most_common(10)
        ],
        "job_performance": job_perf[:15],
    }


@router.get("/platform")
def platform_analytics(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PLATFORM_MANAGE)),
):
    orgs = db.query(Organization).all()
    status_counts = Counter(_value(o.status) for o in orgs)
    plan_counts = Counter(o.plan_code or "starter" for o in orgs)
    mrr_cents = sum(get_plan(o.plan_code or "starter").price_monthly_cents for o in orgs)

    return {
        "organizations": {
            "total": len(orgs),
            "by_status": [{"status": k, "count": v} for k, v in status_counts.items()],
            "by_plan": [{"plan": k, "count": v} for k, v in plan_counts.items()],
            "mrr_cents": mrr_cents,
        },
        "totals": {
            "users": db.query(User).count(),
            "candidates": db.query(Candidate).count(),
            "jobs": db.query(Job).count(),
            "interviews": db.query(Interview).count(),
            "offers": db.query(Offer).count(),
        },
        "top_orgs": sorted(
            (
                {
                    "id": o.id,
                    "name": o.name,
                    "status": _value(o.status),
                    "plan": o.plan_code,
                    "seat_limit": o.seat_limit,
                    "candidates": db.query(Candidate).filter(Candidate.organization_id == o.id).count(),
                    "jobs": db.query(Job).filter(Job.organization_id == o.id).count(),
                }
                for o in orgs
            ),
            key=lambda x: x["candidates"],
            reverse=True,
        )[:10],
    }
