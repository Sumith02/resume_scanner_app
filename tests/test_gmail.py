from pathlib import Path

import pytest

from backend.config import Settings
from backend.errors import AppError
from backend.gmail_service import GmailService
from backend.models import RequestContext
from backend.repository import LocalRepository
from backend.resume_service import ResumeService


def _gmail_service(tmp_path: Path) -> tuple[GmailService, RequestContext]:
    settings = Settings(
        environment="test",
        app_origin="http://testserver",
        supabase_url="",
        supabase_public_key="",
        supabase_secret_key="",
        auth_required=False,
        allow_demo_mode=True,
        google_client_id="client-id",
        google_client_secret="client-secret",
        google_redirect_uri="http://testserver/api/integrations/gmail/callback",
        oauth_state_secret="test-state-secret-with-enough-characters",
        token_encryption_key="test-token-secret-with-enough-characters",
        resend_api_key="",
        mail_from="",
    )
    repository = LocalRepository(tmp_path)
    service = GmailService(settings, repository, ResumeService(settings, repository))
    context = RequestContext(
        user_id="local-user",
        email="recruiter@example.com",
        organization_id="local-organization",
        role="owner",
        authenticated=False,
    )
    return service, context


def test_expired_gmail_access_token_is_refreshed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    service, context = _gmail_service(tmp_path)
    connection = {
        "email": "recruiter@example.com",
        "access_token": service.cipher.encrypt("expired-access-token"),
        "refresh_token": service.cipher.encrypt("refresh-token"),
        "scope": "gmail.readonly",
        "token_type": "Bearer",
        "expiry_date": "2000-01-01T00:00:00Z",
    }
    monkeypatch.setattr(
        service,
        "_token_request",
        lambda _data: {"access_token": "fresh-access-token", "expires_in": 3600},
    )

    updated = service._ensure_access_token(connection, context)

    assert service.cipher.decrypt(updated["access_token"]) == "fresh-access-token"
    assert service.cipher.decrypt(updated["refresh_token"]) == "refresh-token"


def test_revoked_gmail_refresh_token_requests_reconnection(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    service, context = _gmail_service(tmp_path)
    connection = {
        "email": "recruiter@example.com",
        "access_token": service.cipher.encrypt("expired-access-token"),
        "refresh_token": service.cipher.encrypt("revoked-refresh-token"),
        "scope": "gmail.readonly",
        "token_type": "Bearer",
        "expiry_date": "2000-01-01T00:00:00Z",
    }

    def revoked(_data: dict[str, str]) -> dict[str, object]:
        raise AppError("Token has been expired or revoked.", 502, "google_api_error")

    monkeypatch.setattr(service, "_token_request", revoked)

    with pytest.raises(AppError, match="Reconnect the mailbox") as raised:
        service._ensure_access_token(connection, context)
    assert raised.value.code == "gmail_reconnect_required"
