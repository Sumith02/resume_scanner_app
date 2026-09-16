from __future__ import annotations

import base64
import time
import urllib.parse
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from .classifier import NON_RESUME_FILENAMES
from .config import Settings
from .crypto import SignedState, TokenCipher
from .errors import AppError, ServiceUnavailableError
from .models import RequestContext
from .repository import Repository, utc_now
from .resume_service import ALLOWED_EXTENSIONS, MIME_BY_EXTENSION, ResumeService

GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
DEFAULT_QUERY = (
    "has:attachment (filename:pdf OR filename:docx OR filename:txt) "
    "(resume OR cv OR \"curriculum vitae\" OR applicant OR application OR candidate OR \"job application\" OR apply) "
    "newer_than:60d"
)
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GMAIL_API_ROOT = "https://gmail.googleapis.com/gmail/v1/users/me"


class GmailService:
    def __init__(self, settings: Settings, repository: Repository, resumes: ResumeService) -> None:
        self.settings = settings
        self.repository = repository
        self.resumes = resumes
        self.cipher = TokenCipher(settings.token_encryption_key)
        self.state = SignedState(settings.oauth_state_secret)

    def missing_configuration(self) -> list[str]:
        missing: list[str] = []
        if not self.settings.google_client_id:
            missing.append("GOOGLE_CLIENT_ID")
        if not self.settings.google_client_secret:
            missing.append("GOOGLE_CLIENT_SECRET")
        if not self.settings.google_redirect_uri:
            missing.append("GOOGLE_REDIRECT_URI")
        if not self.settings.oauth_state_secret or len(self.settings.oauth_state_secret) < 32:
            missing.append("RESUMEFLOW_OAUTH_STATE_SECRET")
        if not self.settings.token_encryption_key or len(self.settings.token_encryption_key) < 32:
            missing.append("TOKEN_ENCRYPTION_KEY")
        return missing

    def status(self, context: RequestContext) -> dict[str, object]:
        connection = self.repository.get_gmail_connection(context) if self.settings.gmail_configured else None
        configured = self.settings.gmail_configured
        missing = self.missing_configuration() if not configured else []
        if connection:
            message = "Gmail is connected and ready for resume imports."
        elif configured:
            message = "Gmail OAuth is configured. Connect an HR mailbox to import resumes."
        else:
            message = (
                f"Gmail requires OAuth credentials in server environment ({', '.join(missing)})."
                if missing
                else "Gmail OAuth requires configuration."
            )
        return {
            "configured": configured,
            "connected": bool(connection),
            "email": connection.get("email", "") if connection else "",
            "updatedAt": connection.get("updated_at", "") if connection else "",
            "defaultQuery": DEFAULT_QUERY,
            "redirectUri": self.settings.google_redirect_uri,
            "missingKeys": missing,
            "message": message,
        }

    def authorization_url(self, context: RequestContext) -> str:
        self._require_configured()
        state = self.state.create(
            {
                "userId": context.user_id,
                "organizationId": context.organization_id,
                "email": context.email,
                "role": context.role,
                "origin": self.settings.app_origin,
            }
        )
        params = urllib.parse.urlencode(
            {
                "client_id": self.settings.google_client_id,
                "redirect_uri": self.settings.google_redirect_uri,
                "response_type": "code",
                "scope": GMAIL_SCOPE,
                "access_type": "offline",
                "prompt": "consent",
                "include_granted_scopes": "true",
                "state": state,
            }
        )
        return f"{GOOGLE_AUTH_URL}?{params}"

    def callback(self, code: str, state_value: str) -> str:
        self._require_configured()
        if not code or not state_value:
            raise AppError("Google did not return a valid authorization response.", 400, "invalid_oauth_callback")
        state = self.state.verify(state_value)
        organization_id = str(state["organizationId"])
        user_id = str(state["userId"])
        current_role = self.repository.membership_role(organization_id, user_id)
        if current_role not in {"owner", "admin", "recruiter"}:
            raise AppError("You no longer have permission to connect Gmail.", 403, "permission_denied")
        context = RequestContext(
            user_id=user_id,
            organization_id=organization_id,
            email=str(state.get("email", "")),
            role=current_role,
            authenticated=True,
        )
        token = self._token_request(
            {
                "code": code,
                "client_id": self.settings.google_client_id,
                "client_secret": self.settings.google_client_secret,
                "redirect_uri": self.settings.google_redirect_uri,
                "grant_type": "authorization_code",
            }
        )
        refresh_token = str(token.get("refresh_token") or "")
        if not refresh_token:
            raise AppError(
                "Google did not issue offline access. Reconnect Gmail and approve access.", 409, "missing_refresh_token"
            )
        profile = self._raw_gmail_get("/profile", str(token["access_token"]))
        now = utc_now()
        self.repository.save_gmail_connection(
            {
                "email": profile.get("emailAddress") or "Connected Gmail account",
                "access_token": self.cipher.encrypt(str(token["access_token"])),
                "refresh_token": self.cipher.encrypt(refresh_token),
                "scope": str(token.get("scope") or GMAIL_SCOPE),
                "token_type": str(token.get("token_type") or "Bearer"),
                "expiry_date": _expiry_iso(int(token.get("expires_in") or 3600)),
                "created_at": now,
                "token_version": 1,
            },
            context,
        )
        self.repository.audit(
            context, "gmail.connected", "gmail_connection", None, {"email": profile.get("emailAddress", "")}
        )
        origin = str(state.get("origin") or self.settings.app_origin).rstrip("/")
        return f"{origin}/?gmail=connected"

    def disconnect(self, context: RequestContext) -> None:
        connection = self.repository.get_gmail_connection(context)
        if connection:
            try:
                refresh_token = self.cipher.decrypt(str(connection["refresh_token"]))
                httpx.post(GOOGLE_REVOKE_URL, params={"token": refresh_token}, timeout=10)
            except Exception:
                pass
        self.repository.delete_gmail_connection(context)
        self.repository.audit(context, "gmail.disconnected", "gmail_connection", None)

    def import_resumes(self, query: str, role: str, max_results: int, context: RequestContext) -> dict[str, object]:
        self._require_configured()
        connection = self.repository.get_gmail_connection(context)
        if not connection:
            raise AppError("Connect Gmail before importing resumes.", 409, "gmail_not_connected")
        query = (query.strip() or DEFAULT_QUERY)[:500]
        max_results = max(1, min(max_results, 50))
        listing, connection = self._gmail_get(
            "/messages",
            connection,
            context,
            params={"q": query, "maxResults": str(max_results)},
        )
        messages = listing.get("messages") or []
        skipped = 0
        attachments_seen = 0

        def resume_files():
            nonlocal attachments_seen, connection, skipped
            for message_ref in messages:
                message_id = str(message_ref.get("id") or "")
                if not message_id:
                    continue
                message, connection = self._gmail_get(
                    f"/messages/{message_id}", connection, context, params={"format": "full"}
                )
                for part in _flatten_parts(message.get("payload") or {}):
                    filename = str(part.get("filename") or "")
                    extension = Path(filename).suffix.lower()
                    if not filename or extension not in ALLOWED_EXTENSIONS:
                        if filename:
                            skipped += 1
                        continue
                    lower_filename = filename.lower()
                    if any(non_kw in lower_filename for non_kw in NON_RESUME_FILENAMES):
                        if "resume" not in lower_filename and "cv" not in lower_filename:
                            skipped += 1
                            continue
                    attachments_seen += 1
                    if attachments_seen > self.settings.max_upload_files:
                        skipped += 1
                        continue
                    body = part.get("body") or {}
                    encoded = body.get("data")
                    attachment_id = body.get("attachmentId")
                    if not encoded and attachment_id:
                        attachment, connection = self._gmail_get(
                            f"/messages/{message_id}/attachments/{attachment_id}", connection, context
                        )
                        encoded = attachment.get("data")
                    if not encoded:
                        skipped += 1
                        continue
                    yield {
                        "name": filename,
                        "content": _decode_base64url(str(encoded)),
                        "mimeType": str(part.get("mimeType") or MIME_BY_EXTENSION[extension]),
                        "externalId": f"gmail:{message_id}:{attachment_id or filename}",
                    }

        applications, failures, duplicate_skips = self.resumes.process(
            resume_files(),
            context,
            source=f"Gmail: {connection.get('email', '')}",
            role=role,
        )
        skipped += duplicate_skips
        return {
            "applications": applications,
            "failures": failures,
            "importedCount": len(applications),
            "scannedMessages": len(messages),
            "skippedAttachments": skipped,
            "message": f"Imported {len(applications)} resume{'s' if len(applications) != 1 else ''} from Gmail.",
        }

    def _gmail_get(
        self,
        path: str,
        connection: dict[str, Any],
        context: RequestContext,
        params: dict[str, str] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        active = self._ensure_access_token(connection, context)
        access_token = self.cipher.decrypt(str(active["access_token"]))
        try:
            return self._raw_gmail_get(path, access_token, params), active
        except _Unauthorized:
            active = self._refresh(active, context)
            access_token = self.cipher.decrypt(str(active["access_token"]))
            return self._raw_gmail_get(path, access_token, params), active

    def _raw_gmail_get(self, path: str, access_token: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        try:
            response = httpx.get(
                f"{GMAIL_API_ROOT}{path}",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
                timeout=30,
            )
        except httpx.HTTPError as error:
            raise ServiceUnavailableError("Gmail could not be reached. Please try again.") from error
        if response.status_code == 401:
            raise _Unauthorized()
        return _google_response(response)

    def _ensure_access_token(self, connection: dict[str, Any], context: RequestContext) -> dict[str, Any]:
        expires_at = _parse_time(str(connection.get("expiry_date") or ""))
        return self._refresh(connection, context) if expires_at <= time.time() + 120 else connection

    def _refresh(self, connection: dict[str, Any], context: RequestContext) -> dict[str, Any]:
        refresh_token = self.cipher.decrypt(str(connection["refresh_token"]))
        try:
            token = self._token_request(
                {
                    "refresh_token": refresh_token,
                    "client_id": self.settings.google_client_id,
                    "client_secret": self.settings.google_client_secret,
                    "grant_type": "refresh_token",
                }
            )
        except AppError as error:
            if "invalid_grant" in error.message.lower() or "expired or revoked" in error.message.lower():
                raise AppError(
                    "Gmail access expired or was revoked. Reconnect the mailbox to continue.",
                    409,
                    "gmail_reconnect_required",
                ) from error
            raise
        updated = {
            **connection,
            "access_token": self.cipher.encrypt(str(token["access_token"])),
            "refresh_token": connection["refresh_token"],
            "scope": str(token.get("scope") or connection.get("scope") or GMAIL_SCOPE),
            "token_type": str(token.get("token_type") or connection.get("token_type") or "Bearer"),
            "expiry_date": _expiry_iso(int(token.get("expires_in") or 3600)),
            "token_version": 1,
        }
        self.repository.save_gmail_connection(updated, context)
        return updated

    def _token_request(self, data: dict[str, str]) -> dict[str, Any]:
        try:
            response = httpx.post(GOOGLE_TOKEN_URL, data=data, timeout=30)
        except httpx.HTTPError as error:
            raise ServiceUnavailableError("Google OAuth could not be reached. Please try again.") from error
        return _google_response(response)

    def _require_configured(self) -> None:
        if not self.settings.gmail_configured:
            missing = self.missing_configuration()
            missing_text = f": {', '.join(missing)}" if missing else ""
            raise ServiceUnavailableError(
                f"Gmail OAuth or token encryption is not fully configured. Missing server environment variables{missing_text}."
            )


class _Unauthorized(Exception):
    pass


def _google_response(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if response.is_error:
        detail = payload.get("error_description")
        if not detail and isinstance(payload.get("error"), dict):
            detail = payload["error"].get("message")
        raise AppError(str(detail or "Google rejected the request."), 502, "google_api_error")
    return payload


def _flatten_parts(part: dict[str, Any]) -> list[dict[str, Any]]:
    result = [part]
    for child in part.get("parts") or []:
        result.extend(_flatten_parts(child))
    return result


def _decode_base64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _expiry_iso(seconds: int) -> str:
    return (datetime.now(UTC) + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")


def _parse_time(value: str) -> float:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0
