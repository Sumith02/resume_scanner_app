"""Phase 4 — Email templates, outbound messages and Gmail resume ingestion."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import email_service, gmail_service
from backend.config import DEMO_INBOX_DIR, FRONTEND_URL, GOOGLE_REDIRECT_URI
from backend.db import get_db
from backend.deps import ensure_active_org, ensure_company_scope, require_permission
from backend.models import (
    EmailAccount,
    EmailMessage,
    EmailTemplate,
    Organization,
    User,
)
from backend.plans import consume_quota, require_feature
from backend.rbac import EMAIL_MANAGE, EMAIL_READ, GMAIL_CONNECT
from backend.repository import get_candidate, log_audit
from backend.security import create_oauth_state, decode_oauth_state
from backend.serializers import (
    email_account_out,
    email_message_out,
    email_template_out,
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


@router.get("/gmail/connect")
def gmail_connect(
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
    return {
        "oauth_configured": True,
        "auth_url": gmail_service.authorization_url(state, login_hint=user.email),
        "redirect_uri": GOOGLE_REDIRECT_URI,
    }


@router.get("/gmail/callback")
def gmail_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """Browser redirect target for Google OAuth (no bearer token)."""
    if error or not code or not state:
        return RedirectResponse(f"{FRONTEND_URL}/app/email?gmail=error")
    try:
        claims = decode_oauth_state(state)
        tokens = gmail_service.exchange_code(code)
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
    except Exception:  # noqa: BLE001 - any OAuth failure returns to the app with an error
        return RedirectResponse(f"{FRONTEND_URL}/app/email?gmail=error")
    return RedirectResponse(f"{FRONTEND_URL}/app/email?gmail=connected")


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
    if account.email and account.email.lower() not in _authorized_emails(db, org_id):
        raise HTTPException(
            403,
            "The connected mailbox is not a registered user email for this company.",
        )
    summary = gmail_service.sync_account(db, org, account, actor_email=user.email)
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
