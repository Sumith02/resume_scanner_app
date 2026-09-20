from __future__ import annotations

from backend.models import Role

# ---------------------------------------------------------------------------
# Permission vocabulary: <resource>:<action>
# Actions: read, create, edit, delete, manage, approve, review, request, match
# ---------------------------------------------------------------------------

PLATFORM_MANAGE = "platform:manage"
COMPANY_MANAGE = "company:manage"
COMPANY_CREATE = "company:create"
USER_CREATE = "user:create"
USER_MANAGE = "user:manage"
SEAT_REQUEST = "seat:request"
SEAT_APPROVE = "seat:approve"
AUDIT_READ = "audit:read"
USAGE_READ = "usage:read"

JOB_CREATE = "job:create"
JOB_READ = "job:read"
JOB_EDIT = "job:edit"
JOB_DELETE = "job:delete"
CANDIDATE_CREATE = "candidate:create"
CANDIDATE_READ = "candidate:read"
CANDIDATE_EDIT = "candidate:edit"
CANDIDATE_DELETE = "candidate:delete"
CANDIDATE_MATCH = "candidate:match"
NOTE_CREATE = "note:create"
TAG_MANAGE = "tag:manage"
PIPELINE_MANAGE = "pipeline:manage"

# Phase 3 — Intelligence
POOL_MANAGE = "pool:manage"
POOL_READ = "pool:read"
REDISCOVERY_RUN = "rediscovery:run"
COPILOT_USE = "copilot:use"

# Phase 4 — Operations
INTERVIEW_MANAGE = "interview:manage"
INTERVIEW_READ = "interview:read"
SCORECARD_SUBMIT = "scorecard:submit"
OFFER_MANAGE = "offer:manage"
OFFER_READ = "offer:read"
ONBOARDING_MANAGE = "onboarding:manage"
EMAIL_MANAGE = "email:manage"
EMAIL_READ = "email:read"
GMAIL_CONNECT = "gmail:connect"

# Phase 5 — SaaS
ANALYTICS_READ = "analytics:read"
BILLING_READ = "billing:read"
BILLING_MANAGE = "billing:manage"
PLAN_MANAGE = "plan:manage"
PORTAL_MANAGE = "portal:manage"


COMPANY_RESOURCE_PERMISSIONS = [
    JOB_CREATE, JOB_READ, JOB_EDIT, JOB_DELETE,
    CANDIDATE_CREATE, CANDIDATE_READ, CANDIDATE_EDIT, CANDIDATE_DELETE, CANDIDATE_MATCH,
    NOTE_CREATE, TAG_MANAGE, PIPELINE_MANAGE, SEAT_REQUEST, USAGE_READ,
    POOL_MANAGE, POOL_READ, REDISCOVERY_RUN, COPILOT_USE,
    INTERVIEW_MANAGE, INTERVIEW_READ, SCORECARD_SUBMIT,
    OFFER_MANAGE, OFFER_READ, ONBOARDING_MANAGE,
    EMAIL_MANAGE, EMAIL_READ, GMAIL_CONNECT,
    ANALYTICS_READ, PORTAL_MANAGE,
]

# Roles are bundles of permissions. Authorization always checks
# permissions (resource + action), never role names directly.
ROLE_PERMISSIONS: dict[Role, list[str]] = {
    Role.MASTER_ADMIN: [
        PLATFORM_MANAGE, COMPANY_MANAGE, COMPANY_CREATE, USER_CREATE, USER_MANAGE,
        SEAT_APPROVE, AUDIT_READ, USAGE_READ, PLAN_MANAGE,
        *COMPANY_RESOURCE_PERMISSIONS,
    ],
    Role.COMPANY_OWNER: [
        USER_CREATE, USER_MANAGE, SEAT_REQUEST, USAGE_READ, AUDIT_READ,
        BILLING_READ, BILLING_MANAGE,
        *COMPANY_RESOURCE_PERMISSIONS,
    ],
    Role.COMPANY_ADMIN: [
        USER_CREATE, USER_MANAGE, SEAT_REQUEST, USAGE_READ, AUDIT_READ,
        BILLING_READ,
        *COMPANY_RESOURCE_PERMISSIONS,
    ],
    Role.RECRUITER: [
        JOB_CREATE, JOB_READ, JOB_EDIT,
        CANDIDATE_CREATE, CANDIDATE_READ, CANDIDATE_EDIT, CANDIDATE_MATCH,
        NOTE_CREATE, PIPELINE_MANAGE, SEAT_REQUEST, USAGE_READ,
        POOL_MANAGE, POOL_READ, REDISCOVERY_RUN, COPILOT_USE,
        INTERVIEW_MANAGE, INTERVIEW_READ, SCORECARD_SUBMIT,
        OFFER_MANAGE, OFFER_READ, ONBOARDING_MANAGE,
        EMAIL_MANAGE, EMAIL_READ, GMAIL_CONNECT, ANALYTICS_READ,
    ],
    Role.HIRING_MANAGER: [
        JOB_READ, CANDIDATE_READ, CANDIDATE_EDIT, NOTE_CREATE,
        POOL_READ, COPILOT_USE, INTERVIEW_READ, SCORECARD_SUBMIT,
        OFFER_READ, ANALYTICS_READ,
    ],
    Role.INTERVIEWER: [
        JOB_READ, CANDIDATE_READ, INTERVIEW_READ, SCORECARD_SUBMIT,
    ],
    Role.READ_ONLY: [
        JOB_READ, CANDIDATE_READ, POOL_READ, INTERVIEW_READ, OFFER_READ,
    ],
}


def permissions_for(role: Role) -> list[str]:
    return list(ROLE_PERMISSIONS.get(role, []))


def has_permission(role: Role, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, [])


COMPANY_ROLES = {
    Role.COMPANY_OWNER,
    Role.COMPANY_ADMIN,
    Role.RECRUITER,
    Role.HIRING_MANAGER,
    Role.INTERVIEWER,
    Role.READ_ONLY,
}

# Only these two roles may provision/manage users on behalf of an org.
USER_PROVISIONING_ROLES = {Role.COMPANY_OWNER, Role.COMPANY_ADMIN}