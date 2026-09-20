"""Phase 3 — Intelligence API.

Talent pools, AI matching, rediscovery, saved searches and the Copilot.
All queries are tenant-scoped via the authenticated user's organization.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import copilot as copilot_engine
from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.matching_engine import match_candidate, rank_candidates
from backend.models import (
    Candidate,
    Job,
    Organization,
    SavedSearch,
    TalentPool,
    TalentPoolMember,
    User,
    utcnow,
)
from backend.plans import consume_quota, require_feature
from backend.rbac import (
    COPILOT_USE,
    POOL_MANAGE,
    POOL_READ,
    REDISCOVERY_RUN,
)
from backend.repository import get_candidate, get_job, log_audit
from backend.serializers import (
    candidate_out,
    saved_search_out,
    talent_pool_out,
)

router = APIRouter(prefix="/api", tags=["intelligence"])


def _org(db: Session, user: User) -> Organization:
    org = db.get(Organization, user.organization_id)
    if org is None:
        raise HTTPException(404, "Organization not found")
    return org


def _pool(db: Session, org_id: int, pool_id: int) -> TalentPool:
    pool = (
        db.query(TalentPool)
        .filter(TalentPool.id == pool_id, TalentPool.organization_id == org_id)
        .first()
    )
    if pool is None:
        raise HTTPException(404, "Talent pool not found")
    return pool


# -- Talent pools ---------------------------------------------------------

class PoolIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    is_shared: bool = False


class PoolPatch(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = None
    is_shared: bool | None = None


@router.get("/pools")
def list_pools(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(POOL_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    pools = (
        db.query(TalentPool)
        .filter(TalentPool.organization_id == org_id)
        .order_by(TalentPool.created_at.desc())
        .all()
    )
    return [talent_pool_out(p) for p in pools]


@router.post("/pools", status_code=201)
def create_pool(
    payload: PoolIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(POOL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    pool = TalentPool(
        organization_id=org_id,
        name=payload.name,
        description=payload.description,
        is_shared=payload.is_shared,
        created_by_user_id=user.id,
    )
    db.add(pool)
    db.flush()
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="pool.created", resource_type="talent_pool", resource_id=pool.id,
              details={"name": pool.name})
    db.commit()
    return talent_pool_out(pool)


@router.get("/pools/{pool_id}")
def get_pool(
    pool_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(POOL_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    pool = _pool(db, org_id, pool_id)
    members = (
        db.query(Candidate)
        .join(TalentPoolMember, TalentPoolMember.candidate_id == Candidate.id)
        .filter(TalentPoolMember.pool_id == pool.id, Candidate.organization_id == org_id)
        .all()
    )
    out = talent_pool_out(pool, member_count=len(members))
    out["candidates"] = [candidate_out(c) for c in members]
    return out


@router.patch("/pools/{pool_id}")
def update_pool(
    pool_id: int,
    payload: PoolPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(POOL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    pool = _pool(db, org_id, pool_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(pool, field, value)
    pool.updated_at = utcnow()
    db.commit()
    return talent_pool_out(pool)


@router.delete("/pools/{pool_id}", status_code=204)
def delete_pool(
    pool_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(POOL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    pool = _pool(db, org_id, pool_id)
    db.delete(pool)
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="pool.deleted", resource_type="talent_pool", resource_id=pool.id)
    db.commit()


class MembersIn(BaseModel):
    candidate_ids: list[int] = Field(default_factory=list)


@router.post("/pools/{pool_id}/members")
def add_members(
    pool_id: int,
    payload: MembersIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(POOL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    pool = _pool(db, org_id, pool_id)
    existing = {m.candidate_id for m in pool.members}
    added = 0
    for cid in payload.candidate_ids:
        candidate = get_candidate(db, org_id, cid)
        if candidate is None or cid in existing:
            continue
        db.add(TalentPoolMember(organization_id=org_id, pool_id=pool.id,
                                candidate_id=cid, added_by_user_id=user.id))
        added += 1
    db.commit()
    db.refresh(pool)
    return {"added": added, "pool": talent_pool_out(pool)}


@router.delete("/pools/{pool_id}/members/{candidate_id}", status_code=204)
def remove_member(
    pool_id: int,
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(POOL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    pool = _pool(db, org_id, pool_id)
    member = (
        db.query(TalentPoolMember)
        .filter(TalentPoolMember.pool_id == pool.id,
                TalentPoolMember.candidate_id == candidate_id)
        .first()
    )
    if member is None:
        raise HTTPException(404, "Candidate is not in this pool")
    db.delete(member)
    db.commit()


# -- AI matching / rediscovery -------------------------------------------

class MatchIn(BaseModel):
    job_id: int
    threshold: float = 0.0
    limit: int = 25
    exclude_applied: bool = False


@router.post("/match")
def match(
    payload: MatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(REDISCOVERY_RUN)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)
    require_feature(org, "ai_matching")

    job = get_job(db, org_id, payload.job_id)
    if job is None:
        raise HTTPException(404, "Job not found")

    candidates = db.query(Candidate).filter(Candidate.organization_id == org_id).all()
    if payload.exclude_applied:
        candidates = [c for c in candidates if job.id not in (c.matched_job_ids or [])]

    ranked = rank_candidates(
        candidates, job, threshold=payload.threshold, limit=max(1, min(payload.limit, 100))
    )
    consume_quota(db, org, "ai_matches", 1)
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="match.ran", resource_type="job", resource_id=job.id,
              details={"results": len(ranked)})
    db.commit()

    results = []
    for item in ranked:
        data = candidate_out(item["candidate"])
        data.update({
            "match_score": item["score"],
            "match_band": item["band"],
            "matched_skills": item["matched_skills"],
            "missing_skills": item["missing_skills"],
            "match_reasons": item["reasons"],
        })
        results.append(data)
    return {"job_id": job.id, "job_title": job.title, "count": len(results), "results": results}


@router.get("/candidates/{candidate_id}/matches")
def candidate_matches(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(REDISCOVERY_RUN)),
):
    """Rediscover: which open jobs fit this candidate?"""
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)
    require_feature(org, "ai_matching")

    candidate = get_candidate(db, org_id, candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    jobs = db.query(Job).filter(Job.organization_id == org_id).all()
    scored = []
    for job in jobs:
        m = match_candidate(candidate, job)
        scored.append((job, m))
    scored.sort(key=lambda x: x[1]["score"], reverse=True)
    consume_quota(db, org, "ai_matches", 1)
    db.commit()
    return {
        "candidate_id": candidate.id,
        "count": len(scored),
        "results": [
            {"job_id": j.id, "job_title": j.title, "match_score": m["score"],
             "match_band": m["band"], "matched_skills": m["matched_skills"],
             "missing_skills": m["missing_skills"], "match_reasons": m["reasons"]}
            for j, m in scored
        ],
    }


# -- Copilot --------------------------------------------------------------

class CopilotIn(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = 20


@router.post("/copilot")
def copilot(
    payload: CopilotIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(COPILOT_USE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)
    require_feature(org, "copilot")

    result = copilot_engine.answer(db, org_id, payload.query, limit=min(payload.limit, 50))
    result["candidates"] = [candidate_out(c) for c in result["candidates"]]
    return result


# -- Saved searches -------------------------------------------------------

class SavedSearchIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    criteria: dict = Field(default_factory=dict)


@router.get("/saved-searches")
def list_saved_searches(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(POOL_READ)),
):
    org_id = ensure_company_scope(user)
    rows = (
        db.query(SavedSearch)
        .filter(SavedSearch.organization_id == org_id)
        .order_by(SavedSearch.created_at.desc())
        .all()
    )
    return [saved_search_out(s) for s in rows]


@router.post("/saved-searches", status_code=201)
def create_saved_search(
    payload: SavedSearchIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(POOL_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    row = SavedSearch(organization_id=org_id, name=payload.name,
                      criteria=payload.criteria, created_by_user_id=user.id)
    db.add(row)
    db.commit()
    return saved_search_out(row)


@router.delete("/saved-searches/{search_id}", status_code=204)
def delete_saved_search(
    search_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(POOL_READ)),
):
    org_id = ensure_company_scope(user)
    row = (
        db.query(SavedSearch)
        .filter(SavedSearch.id == search_id, SavedSearch.organization_id == org_id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Saved search not found")
    db.delete(row)
    db.commit()
