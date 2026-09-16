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


def test_gmail_import_extracts_only_resumes_and_skips_certificates(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import base64
    from typing import Any

    service, context = _gmail_service(tmp_path)
    service.repository.save_gmail_connection(
        {
            "email": "recruiter@example.com",
            "access_token": service.cipher.encrypt("valid-access-token"),
            "refresh_token": service.cipher.encrypt("valid-refresh-token"),
            "scope": "gmail.readonly",
            "token_type": "Bearer",
            "expiry_date": "2099-01-01T00:00:00Z",
        },
        context,
    )

    def mock_gmail_get(
        path: str, connection: dict[str, Any], _context: RequestContext, params: dict[str, str] | None = None
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        if path == "/messages":
            return {"messages": [{"id": "msg-1"}, {"id": "msg-2"}]}, connection
        if path == "/messages/msg-1":
            # msg-1: candidate application with a resume and a degree certificate
            return {
                "id": "msg-1",
                "payload": {
                    "parts": [
                        {
                            "filename": "Alex_Resume.txt",
                            "mimeType": "text/plain",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"Alex Doe\nalex@example.com\nPython, AWS, FastAPI, Docker\n5 years backend engineer."
                                ).decode()
                            },
                        },
                        {
                            "filename": "Degree_Certificate.pdf",
                            "mimeType": "application/pdf",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"Certificate of Completion\nThis is to certify that Alex completed Python Course."
                                ).decode()
                            },
                        },
                        {
                            "filename": "Cover_Letter.docx",
                            "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"Dear Hiring Manager, please find attached my resume."
                                ).decode()
                            },
                        },
                    ]
                },
            }, connection
        if path == "/messages/msg-2":
            # msg-2: email containing ONLY an invoice and a flight ticket (non-resumes)
            return {
                "id": "msg-2",
                "payload": {
                    "parts": [
                        {
                            "filename": "Tax_Invoice.pdf",
                            "mimeType": "application/pdf",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"TAX INVOICE\nInvoice No: 1024\nTotal Payable: $500"
                                ).decode()
                            },
                        },
                        {
                            "filename": "Boarding_Pass.pdf",
                            "mimeType": "application/pdf",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"Boarding Pass\nFlight AI-202\nGate 4"
                                ).decode()
                            },
                        },
                    ]
                },
            }, connection
        raise ValueError(f"Unexpected path: {path}")

    monkeypatch.setattr(service, "_gmail_get", mock_gmail_get)

    result = service.import_resumes(query="resume", role="Backend Engineer", max_results=25, context=context)

    # Only Alex's resume must be imported
    assert result["importedCount"] == 1
    assert len(result["applications"]) == 1
    assert result["applications"][0]["candidateName"] == "Alex Doe"
    assert result["applications"][0]["email"] == "alex@example.com"
    # Certificates, cover letter, invoice, and boarding pass must be skipped
    assert result["skippedAttachments"] >= 4
    assert len(result["failures"]) == 0


def test_gmail_import_filters_collateral_without_resume_in_name(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import base64
    from typing import Any

    service, context = _gmail_service(tmp_path)
    service.repository.save_gmail_connection(
        {
            "email": "recruiter@example.com",
            "access_token": service.cipher.encrypt("valid-access-token"),
            "refresh_token": service.cipher.encrypt("valid-refresh-token"),
            "scope": "gmail.readonly",
            "token_type": "Bearer",
            "expiry_date": "2099-01-01T00:00:00Z",
        },
        context,
    )

    def mock_gmail_get(
        path: str, connection: dict[str, Any], _context: RequestContext, params: dict[str, str] | None = None
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        if path == "/messages":
            return {"messages": [{"id": "msg-collateral"}]}, connection
        if path == "/messages/msg-collateral":
            return {
                "id": "msg-collateral",
                "payload": {
                    "parts": [
                        {
                            "filename": "priya_profile.txt",
                            "mimeType": "text/plain",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"Priya Patel\npriya@example.com\nReact, TypeScript, Next.js, Node.js\n4 years frontend engineer."
                                ).decode()
                            },
                        },
                        {
                            "filename": "academic_transcript.pdf",
                            "mimeType": "application/pdf",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"Statement of Marks\nSemester Examination\nController of Examinations"
                                ).decode()
                            },
                        },
                    ]
                },
            }, connection
        raise ValueError(f"Unexpected path: {path}")

    monkeypatch.setattr(service, "_gmail_get", mock_gmail_get)

    result = service.import_resumes(query="applicant", role="Frontend Engineer", max_results=25, context=context)

    assert result["importedCount"] == 1
    assert result["applications"][0]["candidateName"] == "Priya Patel"
    assert result["skippedAttachments"] >= 1


