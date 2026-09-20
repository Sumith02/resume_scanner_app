"""Plan catalog and quota/feature definitions (Phase 5).

Plans are code-defined tiers. Organizations reference a plan by `plan_code`
and may override individual feature flags. Quotas are enforced server-side by
the usage/feature helpers below.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import HTTPException
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class Plan:
    code: str
    name: str
    price_monthly_cents: int
    seat_limit: int
    quotas: dict[str, int]
    features: list[str] = field(default_factory=list)


# Quota metrics (per calendar month unless noted):
#   resume_parses, ai_matches, emails_sent, candidates, storage_mb
# Feature flags:
#   gmail_sync, talent_pools, ai_matching, copilot, client_portal, analytics, api_access
PLANS: dict[str, Plan] = {
    "starter": Plan(
        code="starter",
        name="Starter",
        price_monthly_cents=0,
        seat_limit=3,
        quotas={"resume_parses": 100, "ai_matches": 100, "emails_sent": 200, "candidates": 500, "storage_mb": 512},
        features=["talent_pools", "ai_matching", "analytics"],
    ),
    "growth": Plan(
        code="growth",
        name="Growth",
        price_monthly_cents=14900,
        seat_limit=15,
        quotas={"resume_parses": 2000, "ai_matches": 5000, "emails_sent": 5000, "candidates": 10000, "storage_mb": 10240},
        features=["talent_pools", "ai_matching", "copilot", "gmail_sync", "analytics", "client_portal"],
    ),
    "enterprise": Plan(
        code="enterprise",
        name="Enterprise",
        price_monthly_cents=49900,
        seat_limit=100,
        quotas={"resume_parses": 25000, "ai_matches": 100000, "emails_sent": 50000, "candidates": 200000, "storage_mb": 102400},
        features=[
            "talent_pools", "ai_matching", "copilot", "gmail_sync",
            "analytics", "client_portal", "api_access",
        ],
    ),
}

DEFAULT_PLAN = "starter"

# Metrics eligible for quota enforcement.
METERED_METRICS = {
    "resume_parses",
    "ai_matches",
    "emails_sent",
    "candidates",
    "storage_mb",
}


def get_plan(code: str) -> Plan:
    return PLANS.get(code, PLANS[DEFAULT_PLAN])


def plan_out(code: str) -> dict:
    p = get_plan(code)
    return {
        "code": p.code,
        "name": p.name,
        "price_monthly_cents": p.price_monthly_cents,
        "seat_limit": p.seat_limit,
        "quotas": p.quotas,
        "features": p.features,
    }


def has_feature(org, feature: str) -> bool:
    """Plan features, with per-org `feature_flags` overrides."""
    flags = org.feature_flags or {}
    if feature in flags:
        return bool(flags[feature])
    return feature in get_plan(org.plan_code or DEFAULT_PLAN).features


def require_feature(org, feature: str) -> None:
    if not has_feature(org, feature):
        raise HTTPException(
            402,
            f"Feature '{feature}' is not included in the {get_plan(org.plan_code).name} plan.",
        )


def quota_for(org, metric: str) -> int:
    return get_plan(org.plan_code or DEFAULT_PLAN).quotas.get(metric, 0)


# ---------------------------------------------------------------------------
# Usage metering
# ---------------------------------------------------------------------------

def current_period() -> str:
    from backend.models import utcnow

    return utcnow().strftime("%Y-%m")


def get_usage(db: Session, org_id: int, metric: str, period: str | None = None) -> int:
    from backend.models import UsageCounter

    period = period or current_period()
    row = (
        db.query(UsageCounter)
        .filter_by(organization_id=org_id, metric=metric, period=period)
        .first()
    )
    return row.value if row else 0


def increment_usage(db: Session, org_id: int, metric: str, amount: int = 1) -> int:
    from backend.models import UsageCounter

    period = current_period()
    row = (
        db.query(UsageCounter)
        .filter_by(organization_id=org_id, metric=metric, period=period)
        .first()
    )
    if row is None:
        row = UsageCounter(organization_id=org_id, metric=metric, period=period, value=0)
        db.add(row)
        db.flush()
    row.value += amount
    return row.value


def check_quota(db: Session, org, metric: str, amount: int = 1) -> None:
    """Raise 402 if consuming `amount` would exceed the plan quota."""
    if metric not in METERED_METRICS:
        return
    limit = quota_for(org, metric)
    if limit <= 0:
        return
    used = get_usage(db, org.id, metric)
    if used + amount > limit:
        raise HTTPException(
            402,
            f"Plan quota exceeded for '{metric}' ({used}/{limit} used this month). "
            "Upgrade the plan to continue.",
        )


def consume_quota(db: Session, org, metric: str, amount: int = 1) -> None:
    check_quota(db, org, metric, amount)
    increment_usage(db, org.id, metric, amount)


def usage_summary(db: Session, org) -> dict:
    plan = get_plan(org.plan_code or DEFAULT_PLAN)
    metrics = {}
    for metric, limit in plan.quotas.items():
        used = get_usage(db, org.id, metric)
        metrics[metric] = {
            "used": used,
            "limit": limit,
            "remaining": max(0, limit - used),
            "percent": round((used / limit) * 100, 1) if limit else 0,
        }
    return {
        "plan": plan_out(plan.code),
        "period": current_period(),
        "metrics": metrics,
        "features": {f: has_feature(org, f) for f in sorted(_all_features())},
    }


def _all_features() -> set[str]:
    out: set[str] = set()
    for p in PLANS.values():
        out.update(p.features)
    return out