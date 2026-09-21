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
import re
import urllib.parse
from datetime import timedelta
from email.utils import parseaddr
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


def _clean_header_value(val: str) -> str:
    if not val:
        return ""
    try:
        from email.header import decode_header
        parts = decode_header(val)
        out = []
        for text, charset in parts:
            if isinstance(text, bytes):
                out.append(text.decode(charset or "utf-8", errors="replace"))
            else:
                out.append(str(text))
        return " ".join(out).strip()
    except Exception:
        return str(val).strip()


def _safe_b64decode(raw: str | bytes | None) -> bytes:
    if not raw:
        return b""
    if isinstance(raw, bytes):
        s = raw.decode("ascii", errors="ignore")
    else:
        s = str(raw)
    s = s.strip().replace("-", "+").replace("_", "/")
    pad = len(s) % 4
    if pad:
        s += "=" * (4 - pad)
    return base64.b64decode(s)


class GmailClient:
    def __init__(self, access_token: str):
        self.headers = {"Authorization": f"Bearer {access_token}"}

    def _get(self, path: str, params: dict | None = None) -> dict:
        r = httpx.get(f"{GMAIL_API}{path}", headers=self.headers, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def profile(self) -> dict:
        return self._get("/profile")

    def list_messages(self, query: str = GMAIL_QUERY, max_results: int = 50) -> list[dict]:
        data = self._get("/messages", {"q": query, "maxResults": max_results})
        return data.get("messages", [])

    def get_message(self, message_id: str) -> dict:
        return self._get(f"/messages/{message_id}", {"format": "full"})

    def list_threads(self, query: str = GMAIL_QUERY, max_results: int = 50) -> list[str]:
        data = self._get("/threads", {"q": query, "maxResults": max_results})
        return [t["id"] for t in data.get("threads", [])]

    def get_thread(self, thread_id: str) -> dict:
        return self._get(f"/threads/{thread_id}", {"format": "full"})

    def get_attachment(self, message_id: str, attachment_id: str) -> bytes:
        data = self._get(f"/messages/{message_id}/attachments/{attachment_id}")
        return _safe_b64decode(data.get("data", ""))

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
    """Yield (filename, attachment_id, inline_data, mime_type) for every attachment in a message."""
    stack = [payload]
    while stack:
        part = stack.pop()
        children = part.get("parts")
        if children:
            stack.extend(children)
        filename = _clean_header_value(part.get("filename", "") or "")
        if not filename:
            for h in part.get("headers", []) or []:
                hname = h.get("name", "").lower()
                if hname in ("content-disposition", "content-type"):
                    m = re.search(r'filename\*?=(?:UTF-8\'\')?["\']?([^"\';\r\n]+)', h.get("value", ""), re.IGNORECASE)
                    if m:
                        filename = _clean_header_value(m.group(1).strip())
                        break
        mime_type = (part.get("mimeType") or "").lower()

        # Skip plain message body parts
        if not filename and mime_type in ("text/plain", "text/html", "multipart/alternative", "multipart/mixed", "multipart/related"):
            continue

        if not filename:
            if "pdf" in mime_type:
                filename = "document.pdf"
            elif "word" in mime_type or "officedocument" in mime_type:
                filename = "document.docx"

        body = part.get("body", {}) or {}
        attachment_id = body.get("attachmentId")
        inline_data = body.get("data")
        if not filename and attachment_id:
            filename = "document.pdf"

        if filename and (attachment_id or inline_data):
            yield filename, attachment_id, inline_data, mime_type


def _decoded_header(message: dict, name: str) -> str:
    for header in message.get("payload", {}).get("headers", []) or []:
        if header.get("name", "").lower() == name.lower():
            return _clean_header_value(header.get("value", ""))
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
    max_messages: int = 50,
    full_scan: bool = False,
) -> dict:
    if account.is_demo or not oauth_configured():
        return _sync_demo(db, org, account, actor_email=actor_email, full_scan=full_scan)
    return _sync_gmail(db, org, account, actor_email=actor_email, max_messages=max_messages, full_scan=full_scan)


def _mark_processed(account: EmailAccount, keys: list[str], summary: dict) -> None:
    existing = list((account.last_sync_summary or {}).get("processed", []))
    merged = existing + [k for k in keys if k not in existing]
    merged = merged[-MAX_PROCESSED_TRACKED:]
    account.last_sync_summary = {**summary, "processed": merged}


def _sync_demo(db, org: Organization, account: EmailAccount, *, actor_email: str, full_scan: bool = False) -> dict:
    inbox = Path(DEMO_INBOX_DIR)
    processed = set() if full_scan else set((account.last_sync_summary or {}).get("processed", []))
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
            try:
                with db.begin_nested():
                    ingest_resume(
                        db, org=org, filename=path.name, data=data,
                        source=SourceKind.GMAIL, actor_email=actor_email,
                    )
                ingested += 1
                newly.append(path.name)
            except Exception as att_err:
                print(f"Skipping demo resume {path.name}: {att_err}")
                skipped += 1

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
    db, org: Organization, account: EmailAccount, *, actor_email: str, max_messages: int = 100, full_scan: bool = False
) -> dict:
    token = ensure_access_token(db, account)
    if not token:
        account.status = "NEEDS_REAUTH"
        db.flush()
        return {"provider": "gmail", "error": "No valid access token. Please reconnect Gmail.", "ingested": 0}

    client = GmailClient(token)
    processed = set() if full_scan else set((account.last_sync_summary or {}).get("processed", []))
    ingested, skipped, newly = 0, 0, []
    ingested_candidates = []
    errors = []

    try:
        # Search strategy:
        GMAIL_EXCLUDE_QUERY = (
            "-subject:bill -subject:bills -subject:invoice -subject:invoices "
            "-subject:receipt -subject:receipts -subject:statement -subject:statements "
            "-subject:recharge -subject:ticket -subject:tickets -subject:booking "
            "-subject:order -subject:orders -subject:delivery -subject:payment "
            "-subject:transaction -subject:tax -subject:gst -subject:pnr -subject:bank "
            "-subject:policy -subject:salary -subject:payslip -subject:otp"
        )

        # Tier 1: Target resume and applicant emails
        resume_query = (
            "has:attachment (resume OR cv OR curriculum OR candidate OR applicant OR application "
            "OR applying OR apply OR biodata OR job OR hire OR developer OR frontend OR backend "
            "OR engineer OR designer OR internship OR role OR position) "
            + GMAIL_EXCLUDE_QUERY
        )
        tier1_threads = client.list_threads(query=resume_query, max_results=max_messages)
        tier1_msgs = client.list_messages(query=resume_query, max_results=max_messages)

        # Tier 2: Targeted career/resume fallback (explicitly excluding all billing/statements)
        fallback_query = (
            "has:attachment (filename:pdf OR filename:docx OR filename:doc) "
            "(subject:resume OR subject:cv OR subject:application OR subject:applying OR subject:job "
            "OR subject:developer OR subject:engineer OR subject:candidate OR subject:role "
            "OR filename:resume OR filename:cv OR filename:curriculum OR filename:biodata) "
            + GMAIL_EXCLUDE_QUERY
        )
        tier2_threads = client.list_threads(query=fallback_query, max_results=max_messages)
        tier2_msgs = client.list_messages(query=fallback_query, max_results=max_messages)

        seen_threads = set()
        thread_ids = []
        for tid in tier1_threads + tier2_threads:
            if tid and tid not in seen_threads:
                seen_threads.add(tid)
                thread_ids.append(tid)

        for m in tier1_msgs + tier2_msgs:
            tid = m.get("threadId")
            if tid and tid not in seen_threads:
                seen_threads.add(tid)
                thread_ids.append(tid)

        checked_count = 0
        for thread_id in thread_ids:
            if thread_id in processed:
                continue
            checked_count += 1

            try:
                thread = client.get_thread(thread_id)
            except Exception as thr_err:
                print(f"Error fetching thread {thread_id}: {thr_err}")
                continue

            messages = thread.get("messages", [])
            thread_had_ingestion = False

            for message in messages:
                msg_id = message.get("id")
                sender_header = _decoded_header(message, "From")
                sender_name, sender_email = parseaddr(sender_header)
                sender_name = sender_name.strip() if sender_name else None
                sender_email = sender_email.strip().lower() if sender_email else None

                # Don't attribute candidate data to the recruiter's own email in reply threads
                is_mailbox_owner = bool(sender_email and account.email and sender_email == account.email.lower())

                # Discard automated / service sender names so we don't name candidates after billing/system bots
                is_automated = False
                if sender_name:
                    lower_sn = sender_name.lower()
                    if any(term in lower_sn for term in ("no-reply", "noreply", "support", "notification", "billing", "invoice", "bank", "service", "team", "amazon", "flipkart", "swiggy", "zomato", "airtel", "jio", "google", "alert", "alert")):
                        is_automated = True

                candidate_overrides = {}
                if not is_mailbox_owner and not is_automated:
                    if sender_name:
                        candidate_overrides["name"] = sender_name
                    if sender_email:
                        candidate_overrides["email"] = sender_email

                for filename, attachment_id, inline_data, mime_type in _walk_attachments(message.get("payload", {})):
                    lower_fn = (filename or "").lower()
                    # Skip common image formats unless named with resume keywords
                    if lower_fn.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp")) and not any(k in lower_fn for k in ("resume", "cv", "profile", "biodata")):
                        skipped += 1
                        continue

                    if not looks_like_resume(filename, mime_type) or is_probably_bad_attachment(filename):
                        skipped += 1
                        continue

                    try:
                        with db.begin_nested():
                            if inline_data:
                                data = _safe_b64decode(inline_data)
                            elif attachment_id:
                                data = client.get_attachment(msg_id, attachment_id)
                            else:
                                continue

                            if not data or len(data) < 30:
                                skipped += 1
                                continue

                            res = ingest_resume(
                                db, org=org, filename=filename, data=data,
                                source=SourceKind.GMAIL, actor_email=actor_email,
                                overrides=candidate_overrides,
                            )
                        ingested += 1
                        thread_had_ingestion = True
                        cand = res.get("candidate")
                        cname = getattr(cand, "name", None) or sender_name or filename
                        if cname and cname not in ingested_candidates:
                            ingested_candidates.append(cname)
                    except Exception as att_err:
                        err_str = str(att_err)
                        # Content-validation rejections (invoices, receipts, bad structures) are quiet skips
                        if "non-resume" in err_str.lower() or "not a resume" in err_str.lower():
                            skipped += 1
                        else:
                            print(f"Skipping attachment {filename} in thread {thread_id}: {err_str}")
                            errors.append(f"{filename}: {err_str}")
                            skipped += 1

            if thread_had_ingestion:
                newly.append(thread_id)

        try:
            profile = client.profile()
            account.history_id = profile.get("historyId")
            if not account.email:
                account.email = profile.get("emailAddress")
        except Exception:
            pass

        account.status = "CONNECTED"
    except httpx.HTTPStatusError as exc:
        try:
            db.rollback()
        except Exception:
            pass
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
        try:
            db.flush()
        except Exception:
            pass
        return {"provider": "gmail", "error": err_msg, "ingested": ingested}
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        account.status = "ERROR"
        try:
            db.flush()
        except Exception:
            pass
        return {"provider": "gmail", "error": f"Sync error: {str(exc)}", "ingested": ingested}

    summary = {
        "provider": "gmail",
        "ingested": ingested,
        "skipped": skipped,
        "checked_emails": checked_count,
        "total_found": len(thread_ids),
        "ingested_candidates": ingested_candidates,
        "errors": errors[:10],
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