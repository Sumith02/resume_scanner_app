"""Outbound email (Phase 4).

Provider priority: an org's connected Gmail account, else configured SMTP, else
a mock provider that records the message so the whole flow works in dev.
"""
from __future__ import annotations

import smtplib
from email.mime.text import MIMEText

from sqlalchemy.orm import Session

from backend import gmail_service
from backend.config import SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USE_TLS, SMTP_USER
from backend.models import EmailAccount, EmailMessage, utcnow


def smtp_configured() -> bool:
    return bool(SMTP_HOST)


def send_email(
    db: Session,
    *,
    org_id: int,
    to_email: str,
    subject: str,
    body: str,
    candidate_id: int | None = None,
    template_id: int | None = None,
    created_by_user_id: int | None = None,
) -> EmailMessage:
    message = EmailMessage(
        organization_id=org_id,
        candidate_id=candidate_id,
        template_id=template_id,
        to_email=to_email,
        subject=subject,
        body=body,
        status="QUEUED",
        created_by_user_id=created_by_user_id,
    )
    db.add(message)
    db.flush()

    account = (
        db.query(EmailAccount)
        .filter(EmailAccount.organization_id == org_id, EmailAccount.status == "CONNECTED")
        .first()
    )
    try:
        if account and not account.is_demo and gmail_service.oauth_configured():
            token = gmail_service.ensure_access_token(db, account)
            if token:
                raw = gmail_service.build_raw_email(account.email or SMTP_FROM, to_email, subject, body)
                gmail_service.GmailClient(token).send_raw(raw)
                message.provider = "GMAIL"
            else:
                message.provider = "MOCK"
        elif smtp_configured():
            _send_smtp(to_email, subject, body)
            message.provider = "SMTP"
        else:
            message.provider = "MOCK"
        message.status = "SENT"
        message.sent_at = utcnow()
    except Exception as exc:  # noqa: BLE001 - surface provider failure on the record
        message.status = "FAILED"
        message.provider = "SMTP" if smtp_configured() else "MOCK"
        message.error = str(exc)
    db.flush()
    return message


def _send_smtp(to_email: str, subject: str, body: str) -> None:
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
        if SMTP_USE_TLS:
            server.starttls()
        if SMTP_USER:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, [to_email], msg.as_string())


def send_system_email(to_email: str, subject: str, body: str) -> str:
    """Platform/transactional mail (invitations, credentials).

    Not persisted as a tenant EmailMessage so it never pollutes a company
    outbox. Returns the provider used ("SMTP", "MOCK" or "FAILED").
    """
    if not SMTP_HOST:
        return "MOCK"
    try:
        _send_smtp(to_email, subject, body)
        return "SMTP"
    except Exception:  # noqa: BLE001 - invitation delivery must not crash provisioning
        return "FAILED"
