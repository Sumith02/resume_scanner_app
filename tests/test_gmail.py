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


def test_gmail_first_time_sync_from_start_and_subsequent_incremental_sync(
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

    captured_queries: list[str] = []

    def mock_gmail_get(
        path: str, connection: dict[str, Any], _context: RequestContext, params: dict[str, str] | None = None
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        if path == "/messages":
            query_used = params.get("q", "") if params else ""
            captured_queries.append(query_used)
            return {"messages": [{"id": "msg-sync-1"}]}, connection
        if path == "/messages/msg-sync-1":
            return {
                "id": "msg-sync-1",
                "internalDate": "1726543200000",
                "payload": {
                    "headers": [
                        {"name": "Subject", "value": "Job Application: Cloud Architect"},
                        {"name": "From", "value": "arjun@example.com"},
                    ],
                    "parts": [
                        {
                            "filename": "Arjun_Resume.txt",
                            "mimeType": "text/plain",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"Arjun Rao\narjun@example.com\nAWS, GCP, Terraform, Kubernetes\n7 years cloud architect."
                                ).decode()
                            },
                        }
                    ],
                },
            }, connection
        raise ValueError(f"Unexpected path: {path}")

    monkeypatch.setattr(service, "_gmail_get", mock_gmail_get)

    # 1. First time import: should fetch from starting (no after: in query)
    res1 = service.import_resumes(query="", role="Cloud Architect", max_results=25, context=context)
    assert res1["isIncremental"] is False
    assert "after:" not in captured_queries[-1]
    assert res1["importedCount"] == 1
    assert res1["syncCount"] == 1
    assert res1["lastSyncedAt"]

    # 2. Second time import: should continue incrementally from where it left off (after: added to query)
    res2 = service.import_resumes(query="", role="Cloud Architect", max_results=25, context=context)
    assert res2["isIncremental"] is True
    assert "after:" in captured_queries[-1]
    assert res2["syncCount"] == 2

    # 3. Explicit full sync: should ignore watermark and fetch from starting
    res3 = service.import_resumes(query="", role="Cloud Architect", max_results=25, context=context, full_sync=True)
    assert res3["isIncremental"] is False
    assert "after:" not in captured_queries[-1]
    assert res3["syncCount"] == 3


def test_gmail_import_strict_rejects_parseable_transcripts_with_ambiguous_filename(
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
            return {"messages": [{"id": "msg-transcript"}]}, connection
        if path == "/messages/msg-transcript":
            return {
                "id": "msg-transcript",
                "payload": {
                    "headers": [
                        {"name": "Subject", "value": "Semester 8 grade sheet attached"},
                        {"name": "From", "value": "nit@example.com"},
                    ],
                    "parts": [
                        {
                            "filename": "Attachment_1.txt",
                            "mimeType": "text/plain",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"National Institute of Technology\n"
                                    b"Statement of Marks / Academic Transcript\n"
                                    b"Semester Examination 2023\n"
                                    b"Controller of Examinations\n"
                                    b"Cumulative Grade Point Average (CGPA): 8.9 / 10\n"
                                ).decode()
                            },
                        }
                    ],
                },
            }, connection
        raise ValueError(f"Unexpected path: {path}")

    monkeypatch.setattr(service, "_gmail_get", mock_gmail_get)

    result = service.import_resumes(query="resume", role="Open application", max_results=25, context=context)

    # Transcript content must be rejected even though the filename gives no hint
    assert result["importedCount"] == 0
    assert len(result["applications"]) == 0
    assert result["skippedAttachments"] >= 1


def test_gmail_import_skips_neutral_email_with_structured_bank_form(
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
            return {"messages": [{"id": "msg-bank-form"}]}, connection
        if path == "/messages/msg-bank-form":
            return {
                "id": "msg-bank-form",
                "payload": {
                    "headers": [
                        {"name": "Subject", "value": "Application Form - Branch Manager"},
                        {"name": "From", "value": "sbi@example.com"},
                    ],
                    "parts": [
                        {
                            "filename": "Application_Form.pdf",
                            "mimeType": "text/plain",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"State Bank of India\n"
                                    b"Application for the post of Branch Manager\n"
                                    b"Registration Number: SBI/2026/4521\n"
                                    b"Identification Marks: Mole on left cheek\n"
                                    b"Name: Rahul Kumar\n"
                                    b"Work Experience: 12 years\n"
                                    b"Signature of the Applicant: Rahul Kumar\n"
                                ).decode()
                            },
                        }
                    ],
                },
            }, connection
        raise ValueError(f"Unexpected path: {path}")

    monkeypatch.setattr(service, "_gmail_get", mock_gmail_get)

    result = service.import_resumes(query="resume", role="Open application", max_results=25, context=context)

    # Neutral, non-candidate email carrying a bank application form must be skipped entirely
    assert result["importedCount"] == 0
    assert len(result["applications"]) == 0
    assert result["skippedAttachments"] == 1


def test_gmail_import_refetches_candidate_email_with_explicit_resume_filename(
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
            return {"messages": [{"id": "msg-forward"}]}, connection
        if path == "/messages/msg-forward":
            return {
                "id": "msg-forward",
                "payload": {
                    "headers": [
                        {"name": "Subject", "value": "FW: Profile shared by team"},
                        {"name": "From", "value": "internal@example.com"},
                    ],
                    "parts": [
                        {
                            "filename": "priya_profile.txt",
                            "mimeType": "text/plain",
                            "body": {
                                "data": base64.urlsafe_b64encode(
                                    b"Priya Patel\npriya@example.com\nReact, TypeScript, Next.js, Node.js\n4 years frontend engineer."
                                ).decode()
                            },
                        }
                    ],
                },
            }, connection
        raise ValueError(f"Unexpected path: {path}")

    monkeypatch.setattr(service, "_gmail_get", mock_gmail_get)

    result = service.import_resumes(query="resume", role="Frontend Engineer", max_results=25, context=context)

    # Neutral/forwarded email but the attachment names itself a profile -> still fetched
    assert result["importedCount"] == 1
    assert result["applications"][0]["candidateName"] == "Priya Patel"


def test_gmail_email_level_disqualification_skips_invoices_without_parsing(
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
            return {"messages": [{"id": "msg-invoice"}]}, connection
        if path == "/messages/msg-invoice":
            return {
                "id": "msg-invoice",
                "payload": {
                    "headers": [
                        {"name": "Subject", "value": "Tax Invoice #INV-2024-990 from Cloud Vendor"},
                    ],
                    "parts": [
                        {
                            "filename": "invoice_attachment.pdf",
                            "mimeType": "application/pdf",
                            "body": {
                                "data": base64.urlsafe_b64encode(b"Some PDF content").decode()
                            },
                        }
                    ],
                },
            }, connection
        raise ValueError(f"Unexpected path: {path}")

    monkeypatch.setattr(service, "_gmail_get", mock_gmail_get)

    result = service.import_resumes(query="invoice", role="Open application", max_results=25, context=context)

    # Email level check should skip the email immediately without creating any applications
    assert result["importedCount"] == 0
    assert result["skippedAttachments"] == 1
    assert len(result["applications"]) == 0



