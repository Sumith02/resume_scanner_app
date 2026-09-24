"""Phase 4 — Email templates, outbound messages and Gmail resume ingestion."""
from __future__ import annotations

from pathlib import Path

import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import email_service, gmail_service
from backend.config import DEMO_INBOX_DIR, FRONTEND_URL, GOOGLE_REDIRECT_URI
from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.models import (
    Candidate,
    EmailAccount,
    EmailMessage,
    EmailTemplate,
    Job,
    Organization,
    User,
)
from backend.plans import consume_quota, require_feature
from backend.rbac import EMAIL_MANAGE, EMAIL_READ, GMAIL_CONNECT
from backend.repository import get_candidate, get_job, log_audit
from backend.security import create_oauth_state, decode_oauth_state
from backend.serializers import (
    email_account_out,
    email_message_out,
    email_template_out,
    job_out,
)

router = APIRouter(prefix="/api/email", tags=["email"])


def _org(db: Session, user: User) -> Organization:
    org = db.get(Organization, user.organization_id)
    if org is None:
        raise HTTPException(404, "Organization not found")
    return org


def _authorized_emails(db: Session, org_id: int) -> set[str]:
    """Emails registered (by the platform/admin) that may own the mailbox.

    Only accounts provisioned for the tenant can pull resumes into it — a
    connector can never be pointed at an arbitrary personal mailbox.
    """
    from backend.rbac import GMAIL_CONNECT, permissions_for

    emails = set()
    for u in db.query(User).filter(User.organization_id == org_id).all():
        status = u.status.value if hasattr(u.status, "value") else str(u.status)
        if status != "INACTIVE" and GMAIL_CONNECT in permissions_for(u.role):
            emails.add(u.email.lower())
    return emails


# -- Templates ------------------------------------------------------------

class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)


@router.get("/templates")
def list_templates(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(EMAIL_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    rows = (
        db.query(EmailTemplate)
        .filter(EmailTemplate.organization_id == org_id)
        .order_by(EmailTemplate.created_at.desc())
        .all()
    )
    return [email_template_out(t) for t in rows]


@router.post("/templates", status_code=201)
def create_template(
    payload: TemplateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(EMAIL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    row = EmailTemplate(organization_id=org_id, created_by_user_id=user.id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return email_template_out(row)


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(EMAIL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    row = (
        db.query(EmailTemplate)
        .filter(EmailTemplate.id == template_id, EmailTemplate.organization_id == org_id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Template not found")
    db.delete(row)
    db.commit()


# -- Outbound messages ----------------------------------------------------

class SendIn(BaseModel):
    to_email: str | None = None
    candidate_id: int | None = None
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)
    template_id: int | None = None


@router.get("/messages")
def list_messages(
    candidate_id: int | None = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(EMAIL_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    q = db.query(EmailMessage).filter(EmailMessage.organization_id == org_id)
    if candidate_id:
        q = q.filter(EmailMessage.candidate_id == candidate_id)
    rows = q.order_by(EmailMessage.created_at.desc()).limit(limit).all()
    return [email_message_out(m) for m in rows]


@router.post("/send", status_code=201)
def send(
    payload: SendIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(EMAIL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)

    to_email = payload.to_email
    if payload.candidate_id is not None:
        candidate = get_candidate(db, org_id, payload.candidate_id)
        if candidate is None:
            raise HTTPException(404, "Candidate not found")
        to_email = to_email or candidate.email
    if not to_email:
        raise HTTPException(422, "A recipient email or candidate with an email is required")

    consume_quota(db, org, "emails_sent", 1)
    message = email_service.send_email(
        db, org_id=org_id, to_email=to_email, subject=payload.subject, body=payload.body,
        candidate_id=payload.candidate_id, template_id=payload.template_id,
        created_by_user_id=user.id,
    )
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="email.sent", resource_type="email_message", resource_id=message.id,
              details={"to": to_email, "provider": message.provider, "status": message.status})
    db.commit()
    db.refresh(message)
    return email_message_out(message)


class VacancyBroadcastIn(BaseModel):
    job_id: int
    audience: str = "matching"  # "matching" | "all"
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)
    candidate_ids: list[int] | None = None


def _evaluate_candidate_job_match(c: Candidate, job: Job) -> tuple[bool, str]:
    """Check if candidate matches the job's domain/skills, and return match reason."""
    if not c.email:
        return False, "No email address"

    if job.id in (c.matched_job_ids or []):
        return True, "Pipeline match"

    cand_skills = {s.lower() for s in (c.skills or [])}
    job_skills = {s.lower() for s in (job.skills or [])}

    overlap = cand_skills & job_skills
    if overlap:
        matched_str = ", ".join(list(overlap)[:3])
        return True, f"Skill match ({matched_str})"

    # Job title tokens
    import re
    ignore_words = {"and", "the", "for", "with", "all", "any", "our", "lead", "senior", "junior", "staff", "head", "role"}
    title_words = {
        w.lower()
        for w in re.split(r"[\s\-_/,]+", job.title or "")
        if len(w) > 2 and w.lower() not in ignore_words
    }
    cand_title = (c.current_title or "").lower()
    for tw in title_words:
        if tw in cand_title:
            return True, f"Title match ('{tw}')"

    if job.department:
        dept = job.department.lower()
        if dept in cand_title or any(dept in s for s in cand_skills):
            return True, f"Department match ({job.department})"

    resume_lower = (c.resume_text or "").lower()
    for js in job_skills:
        if re.search(rf"\b{re.escape(js)}\b", resume_lower):
            return True, f"Resume skill match ({js})"

    return False, "No match"


def _interpolate_vacancy_text(template_str: str, candidate: Candidate, job: Job, org: Organization) -> str:
    res = template_str
    replacements = {
        "{{candidate_name}}": candidate.name or "Candidate",
        "{{job_title}}": job.title or "Open Role",
        "{{company_name}}": org.name or "Our Company",
        "{{location}}": job.location or "Not specified",
        "{{salary_range}}": job.salary_range or "Competitive",
        "{{department}}": job.department or "General",
        "{{employment_type}}": job.employment_type or "Full-time",
        "{{requirements}}": (job.requirements or "See job description").strip(),
    }
    for k, v in replacements.items():
        res = res.replace(k, str(v))
    return res


@router.get("/vacancy-candidates")
def get_vacancy_candidates(
    job_id: int,
    audience: str = Query("matching", pattern="^(matching|all)$"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(EMAIL_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    job = get_job(db, org_id, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")

    candidates = (
        db.query(Candidate)
        .filter(Candidate.organization_id == org_id)
        .order_by(Candidate.created_at.desc())
        .all()
    )

    recipients = []
    for c in candidates:
        if not c.email:
            continue
        if audience == "all":
            recipients.append((c, "All candidates broadcast"))
        else:
            is_match, reason = _evaluate_candidate_job_match(c, job)
            if is_match:
                recipients.append((c, reason))

    return {
        "job": job_out(job),
        "total_candidates": len(candidates),
        "eligible_count": len(recipients),
        "audience": audience,
        "candidates": [
            {
                "id": c.id,
                "name": c.name,
                "email": c.email,
                "current_title": c.current_title,
                "skills": c.skills or [],
                "location": c.location,
                "stage": c.stage.value if hasattr(c.stage, "value") else c.stage,
                "match_reason": reason,
            }
            for c, reason in recipients
        ],
    }


@router.post("/broadcast-vacancy", status_code=200)
def broadcast_vacancy(
    payload: VacancyBroadcastIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(EMAIL_MANAGE)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)

    job = get_job(db, org_id, payload.job_id)
    if job is None:
        raise HTTPException(404, "Job not found")

    candidates = (
        db.query(Candidate)
        .filter(Candidate.organization_id == org_id)
        .all()
    )

    target_candidates: list[Candidate] = []
    if payload.candidate_ids:
        id_set = set(payload.candidate_ids)
        target_candidates = [c for c in candidates if c.id in id_set and c.email]
    elif payload.audience == "all":
        target_candidates = [c for c in candidates if c.email]
    else:  # matching domain/skills
        for c in candidates:
            if not c.email:
                continue
            is_match, _ = _evaluate_candidate_job_match(c, job)
            if is_match:
                target_candidates.append(c)

    if not target_candidates:
        raise HTTPException(422, "No candidates with valid email address found for the selected audience")

    consume_quota(db, org, "emails_sent", len(target_candidates))

    sent_count = 0
    for cand in target_candidates:
        interpolated_subject = _interpolate_vacancy_text(payload.subject, cand, job, org)
        interpolated_body = _interpolate_vacancy_text(payload.body, cand, job, org)

        email_service.send_email(
            db,
            org_id=org_id,
            to_email=cand.email,
            subject=interpolated_subject,
            body=interpolated_body,
            candidate_id=cand.id,
            created_by_user_id=user.id,
        )
        sent_count += 1

    log_audit(
        db,
        org_id=org_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="email.vacancy_broadcast",
        resource_type="job",
        resource_id=job.id,
        details={
            "job_title": job.title,
            "audience": payload.audience,
            "sent_count": sent_count,
        },
    )

    db.commit()

    return {
        "status": "success",
        "sent_count": sent_count,
        "job_title": job.title,
        "audience": payload.audience,
    }


# -- Gmail connection & sync ---------------------------------------------

def _account(db: Session, org_id: int) -> EmailAccount | None:
    return (
        db.query(EmailAccount)
        .filter(EmailAccount.organization_id == org_id)
        .order_by(EmailAccount.created_at.desc())
        .first()
    )


@router.get("/gmail/status")
def gmail_status(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(EMAIL_READ)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    account = _account(db, org_id)
    return {
        "oauth_configured": gmail_service.oauth_configured(),
        "demo_available": True,
        "account": email_account_out(account) if account else None,
        "smtp_configured": email_service.smtp_configured(),
    }


def _get_redirect_uri(request: Request) -> str:
    from urllib.parse import urlparse

    origin = request.headers.get("origin")
    if origin and ("edvols.in" in origin or "localhost" in origin):
        return f"{origin.rstrip('/')}/api/email/gmail/callback"

    referer = request.headers.get("referer")
    if referer:
        p = urlparse(referer)
        if p.netloc and ("edvols.in" in p.netloc or "localhost" in p.netloc):
            return f"{p.scheme}://{p.netloc}/api/email/gmail/callback"

    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if host:
        host = host.split(",")[0].strip()
        proto = request.headers.get("x-forwarded-proto") or ("http" if host.startswith("localhost") or host.startswith("127.0.0.1") else "https")
        if "edvols.in" in host or host.startswith("localhost") or host.startswith("127.0.0.1"):
            return f"{proto}://{host}/api/email/gmail/callback"

    env_uri = os.getenv("GOOGLE_REDIRECT_URI")
    if env_uri and "vercel.app" not in env_uri:
        return env_uri

    return "https://talent.edvols.in/api/email/gmail/callback"


def _get_frontend_url(request: Request) -> str:
    from urllib.parse import urlparse

    origin = request.headers.get("origin")
    if origin and ("edvols.in" in origin or "localhost" in origin):
        return origin.rstrip("/")

    referer = request.headers.get("referer")
    if referer:
        p = urlparse(referer)
        if p.netloc and ("edvols.in" in p.netloc or "localhost" in p.netloc):
            return f"{p.scheme}://{p.netloc}"

    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if host:
        host = host.split(",")[0].strip()
        proto = request.headers.get("x-forwarded-proto") or ("http" if host.startswith("localhost") or host.startswith("127.0.0.1") else "https")
        if "edvols.in" in host or host.startswith("localhost") or host.startswith("127.0.0.1"):
            return f"{proto}://{host}"

    env_url = os.getenv("FRONTEND_URL")
    if env_url and "vercel.app" not in env_url:
        return env_url

    return "https://talent.edvols.in"


@router.get("/gmail/connect")
def gmail_connect(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(GMAIL_CONNECT)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)
    require_feature(org, "gmail_sync")
    if not gmail_service.oauth_configured():
        return {
            "oauth_configured": False,
            "auth_url": None,
            "message": "Google OAuth is not configured. Use demo connect to try the flow.",
        }
    state = create_oauth_state(org_id, user.id)
    redirect_uri = _get_redirect_uri(request)
    return {
        "oauth_configured": True,
        "auth_url": gmail_service.authorization_url(state, login_hint=user.email, redirect_uri=redirect_uri),
        "redirect_uri": redirect_uri,
    }


@router.get("/gmail/callback")
def gmail_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """Browser redirect target for Google OAuth (no bearer token)."""
    redirect_uri = _get_redirect_uri(request)
    frontend_url = _get_frontend_url(request)
    if error or not code or not state:
        return RedirectResponse(f"{frontend_url}/app/email?gmail=error")
    try:
        claims = decode_oauth_state(state)
        tokens = gmail_service.exchange_code(code, redirect_uri=redirect_uri)
        from backend.db import SessionLocal

        db = SessionLocal()
        try:
            owner = db.get(User, claims["user_id"])
            if owner is None:
                raise ValueError("Unknown user for OAuth state")

            profile = gmail_service.GmailClient(tokens["access_token"]).profile()
            connected_email = (profile.get("emailAddress") or "").lower()
            if connected_email and connected_email != owner.email.lower():
                existing = db.query(User).filter(User.email == connected_email).first()
                if existing is None:
                    owner.email = connected_email
                    db.flush()

            account = (
                db.query(EmailAccount)
                .filter(EmailAccount.organization_id == claims["org_id"])
                .first()
            )
            if account is None:
                account = EmailAccount(
                    organization_id=claims["org_id"],
                    provider="gmail",
                    connected_by_user_id=claims["user_id"],
                )
                db.add(account)
            gmail_service.save_gmail_tokens(account, tokens)
            account.email = connected_email or owner.email.lower()
            account.history_id = profile.get("historyId")
            account.status = "CONNECTED"
            account.is_demo = False
            db.commit()
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        return RedirectResponse(f"{frontend_url}/app/email?gmail=error&details={urllib.parse.quote(str(exc))}")
    return RedirectResponse(f"{frontend_url}/app/email?gmail=connected")


@router.post("/gmail/connect-demo", status_code=201)
def gmail_connect_demo(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(GMAIL_CONNECT)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)
    require_feature(org, "gmail_sync")

    Path(DEMO_INBOX_DIR).mkdir(parents=True, exist_ok=True)
    account = _account(db, org_id)
    if account is None:
        account = EmailAccount(organization_id=org_id, provider="gmail")
        db.add(account)
    account.is_demo = True
    account.status = "CONNECTED"
    account.email = user.email.lower()
    account.connected_by_user_id = user.id
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="gmail.connected", resource_type="email_account", resource_id=account.id,
              details={"demo": True})
    db.commit()
    return {"account": email_account_out(account), "inbox_dir": DEMO_INBOX_DIR}


@router.post("/gmail/sync")
def gmail_sync(
    full_scan: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(GMAIL_CONNECT)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    org = _org(db, user)
    require_feature(org, "gmail_sync")

    account = _account(db, org_id)
    if account is None:
        raise HTTPException(400, "No Gmail account connected")
    if account.organization_id != org_id:
        raise HTTPException(403, "Mailbox does not belong to this company")

    authorized = _authorized_emails(db, org_id)
    if account.email and account.email.lower() not in authorized:
        if account.is_demo or not account.connected_by_user_id:
            raise HTTPException(
                403,
                "The connected mailbox is not a registered user email for this company.",
            )

    summary = gmail_service.sync_account(db, org, account, actor_email=user.email, full_scan=full_scan)
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="gmail.synced", resource_type="email_account", resource_id=account.id,
              details=summary)
    db.commit()
    return {"summary": summary, "account": email_account_out(account)}


@router.delete("/gmail", status_code=204)
def gmail_disconnect(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(GMAIL_CONNECT)),
):
    org_id = ensure_company_scope(user)
    ensure_active_org(user, db)
    account = _account(db, org_id)
    if account is None:
        raise HTTPException(404, "No Gmail account connected")
    db.delete(account)
    log_audit(db, org_id=org_id, actor_user_id=user.id, actor_email=user.email,
              action="gmail.disconnected", resource_type="email_account",
              resource_id=account.id)
    db.commit()
