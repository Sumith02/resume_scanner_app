"""Resume ingestion from email (Phase 4).

Gmail is treated as a *source adapter*: it yields `(filename, bytes)` for
resume-like attachments and hands them to `ingestion.ingest_resume`, the same
pipeline used by manual uploads. That means parsing, dedupe, storage, audit and
quota metering are identical no matter where a resume came from.

Two providers:
  * Real Gmail REST (OAuth 2.0) when GOOGLE_CLIENT_ID/SECRET are configured.
  * A local demo inbox when they are not, so the whole flow is runnable and
    testable without live Google credentials.
"""
from __future__ import annotations

import base64
import urllib.parse
from datetime import timedelta
from pathlib import Path

import httpx

from backend.config import (
    DEMO_INBOX_DIR,
    GMAIL_SCOPES,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
)
from backend.crypto import decrypt, encrypt
from backend.ingestion import ingest_resume, is_probably_bad_attachment, looks_like_resume
from backend.models import EmailAccount, Organization, SourceKind, utcnow

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
GMAIL_QUERY = (
    "has:attachment (filename:pdf OR filename:docx OR filename:doc OR filename:txt)"
    " newer_than:45d"
)
MAX_PROCESSED_TRACKED = 500


def oauth_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


def authorization_url(
    state: str, login_hint: str | None = None, redirect_uri: str | None = None
) -> str:
    if not oauth_configured():
        raise RuntimeError("Google OAuth is not configured")
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri or GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(GMAIL_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    if login_hint:
        params["login_hint"] = login_hint
    return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"


def exchange_code(code: str, redirect_uri: str | None = None) -> dict:
    resp = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri or GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _refresh(refresh_token: str) -> dict:
    resp = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "refresh_token": refresh_token,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def ensure_access_token(db, account: EmailAccount) -> str | None:
    """Return a valid access token, refreshing in place when expired."""
    token = decrypt(account.encrypted_access_token)
    expiry = account.token_expiry
    if token and (expiry is None or expiry > utcnow()):
        return token
    refresh_token = decrypt(account.encrypted_refresh_token)
    if not refresh_token:
        return token
    try:
        data = _refresh(refresh_token)
        account.encrypted_access_token = encrypt(data["access_token"])
        expires_in = int(data.get("expires_in", 3600))
        account.token_expiry = utcnow() + timedelta(seconds=expires_in - 60)
        db.flush()
        return data["access_token"]
    except Exception as exc:
        print("Failed to refresh Gmail token:", exc)
        return None


class GmailClient:
    def __init__(self, access_token: str):
        self.headers = {"Authorization": f"Bearer {access_token}"}

    def _get(self, path: str, params: dict | None = None) -> dict:
        r = httpx.get(f"{GMAIL_API}{path}", headers=self.headers, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def profile(self) -> dict:
        return self._get("/profile")

    def list_messages(self, query: str = GMAIL_QUERY, max_results: int = 25) -> list[str]:
        data = self._get("/messages", {"q": query, "maxResults": max_results})
        return [m["id"] for m in data.get("messages", [])]

    def get_message(self, message_id: str) -> dict:
        return self._get(f"/messages/{message_id}", {"format": "full"})

    def get_attachment(self, message_id: str, attachment_id: str) -> bytes:
        data = self._get(f"/messages/{message_id}/attachments/{attachment_id}")
        return base64.urlsafe_b64decode(data["data"].encode())

    def send_raw(self, raw: str) -> dict:
        r = httpx.post(
            f"{GMAIL_API}/messages/send",
            headers=self.headers,
            json={"raw": raw},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


def _walk_attachments(payload: dict):
    """Yield (filename, attachment_id) for every attachment in a message."""
    stack = [payload]
    while stack:
        part = stack.pop()
        children = part.get("parts")
        if children:
            stack.extend(children)
        filename = part.get("filename")
        body = part.get("body", {}) or {}
        if filename and body.get("attachmentId"):
            yield filename, body["attachmentId"]


def _decoded_header(message: dict, name: str) -> str:
    for header in message.get("payload", {}).get("headers", []) or []:
        if header.get("name", "").lower() == name.lower():
            return header.get("value", "")
    return ""


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

def sync_account(
    db,
    org: Organization,
    account: EmailAccount,
    *,
    actor_email: str = "gmail-sync",
    max_messages: int = 25,
) -> dict:
    if account.is_demo or not oauth_configured():
        return _sync_demo(db, org, account, actor_email=actor_email)
    return _sync_gmail(db, org, account, actor_email=actor_email, max_messages=max_messages)


def _mark_processed(account: EmailAccount, keys: list[str], summary: dict) -> None:
    existing = list((account.last_sync_summary or {}).get("processed", []))
    merged = existing + [k for k in keys if k not in existing]
    merged = merged[-MAX_PROCESSED_TRACKED:]
    account.last_sync_summary = {**summary, "processed": merged}


def _sync_demo(db, org: Organization, account: EmailAccount, *, actor_email: str) -> dict:
    inbox = Path(DEMO_INBOX_DIR)
    processed = set((account.last_sync_summary or {}).get("processed", []))
    ingested, skipped, newly = 0, 0, []

    if inbox.exists():
        for path in sorted(inbox.iterdir()):
            if not path.is_file() or path.name.startswith("."):
                continue
            if path.name in processed:
                continue
            data = path.read_bytes()
            if not looks_like_resume(path.name) or is_probably_bad_attachment(path.name):
                skipped += 1
                newly.append(path.name)
                continue
            ingest_resume(
                db, org=org, filename=path.name, data=data,
                source=SourceKind.GMAIL, actor_email=actor_email,
            )
            ingested += 1
            newly.append(path.name)

    summary = {
        "provider": "demo",
        "ingested": ingested,
        "skipped": skipped,
        "last_run": utcnow().isoformat(),
    }
    account.last_sync_at = utcnow()
    _mark_processed(account, newly, summary)
    db.flush()
    return summary


def _sync_gmail(
    db, org: Organization, account: EmailAccount, *, actor_email: str, max_messages: int
) -> dict:
    token = ensure_access_token(db, account)
    if not token:
        account.status = "NEEDS_REAUTH"
        db.flush()
        return {"provider": "gmail", "error": "No valid access token. Please reconnect Gmail.", "ingested": 0}

    client = GmailClient(token)
    processed = set((account.last_sync_summary or {}).get("processed", []))
    ingested, skipped, newly = 0, 0, []

    try:
        messages = client.list_messages(max_results=max_messages)
        # If no messages found with 45d filter, try broader search
        if not messages:
            messages = client.list_messages(
                query="has:attachment (filename:pdf OR filename:docx OR filename:doc OR filename:txt)",
                max_results=max_messages,
            )

        for message_id in messages:
            if message_id in processed:
                continue
            message = client.get_message(message_id)
            for filename, attachment_id in _walk_attachments(message.get("payload", {})):
                if not looks_like_resume(filename) or is_probably_bad_attachment(filename):
                    skipped += 1
                    continue
                try:
                    data = client.get_attachment(message_id, attachment_id)
                    ingest_resume(
                        db, org=org, filename=filename, data=data,
                        source=SourceKind.GMAIL, actor_email=actor_email,
                    )
                    ingested += 1
                except Exception as att_err:
                    print(f"Skipping attachment {filename}: {att_err}")
                    skipped += 1
            newly.append(message_id)

        try:
            profile = client.profile()
            account.history_id = profile.get("historyId")
            if not account.email:
                account.email = profile.get("emailAddress")
        except Exception:
            pass

        account.status = "CONNECTED"
    except httpx.HTTPStatusError as exc:
        account.status = "ERROR"
        err_msg = str(exc)
        try:
            err_json = exc.response.json()
            if "error" in err_json and "message" in err_json["error"]:
                err_msg = err_json["error"]["message"]
        except Exception:
            err_msg = exc.response.text or str(exc)

        if "has not been used in project" in err_msg or "disabled" in err_msg.lower():
            err_msg = (
                "Gmail API is not enabled in your Google Cloud Console project. "
                "Go to Google Cloud Console -> APIs & Services -> Library -> Search 'Gmail API' -> Click Enable."
            )
        db.flush()
        return {"provider": "gmail", "error": err_msg, "ingested": ingested}
    except Exception as exc:
        account.status = "ERROR"
        db.flush()
        return {"provider": "gmail", "error": f"Sync error: {str(exc)}", "ingested": ingested}

    summary = {
        "provider": "gmail",
        "ingested": ingested,
        "skipped": skipped,
        "last_run": utcnow().isoformat(),
    }
    account.last_sync_at = utcnow()
    _mark_processed(account, newly, summary)
    db.flush()
    return summary


def save_gmail_tokens(account: EmailAccount, tokens: dict, email: str | None = None) -> None:
    account.encrypted_access_token = encrypt(tokens.get("access_token"))
    if tokens.get("refresh_token"):
        account.encrypted_refresh_token = encrypt(tokens["refresh_token"])
    if tokens.get("expires_in"):
        account.token_expiry = utcnow() + timedelta(seconds=int(tokens["expires_in"]) - 60)
    if email:
        account.email = email
    account.status = "CONNECTED"


def build_raw_email(sender: str, to: str, subject: str, body: str) -> str:
    message = (
        f"From: {sender}\r\n"
        f"To: {to}\r\n"
        f"Subject: {subject}\r\n"
        "MIME-Version: 1.0\r\n"
        'Content-Type: text/plain; charset="UTF-8"\r\n\r\n'
        f"{body}"
    )
    return base64.urlsafe_b64encode(message.encode()).decode()