import base64

import pytest

from backend.resume_service import extract_current_title, extract_experience_years, is_valid_resume_content


RESUME = (
    "Anita Rao\nanita@example.com\n"
    "Education: Bachelor of Arts\nExperience: Receptionist, 2021 - Present\n"
    "Skills: Scheduling, customer care, record keeping"
)


@pytest.mark.parametrize("filename,text", [
    ("resume.pdf", "Contact our team at help@example.com for more information."),
    ("document.pdf", "Python React workshop\ntraining@example.com\nLearn technical skills."),
    ("resume.pdf", "Dear Hiring Manager,\nI am writing to apply.\n" + RESUME),
    ("document.pdf", "Job Description\n" + RESUME),
    ("document.pdf", "This certifies that Anita completed the course.\n" + RESUME),
    ("resume.pdf", "Tax Invoice\nBill To: Anita\n" + RESUME),
    ("document.pdf", "We are hiring\n" + RESUME),
    ("document.pdf", "Skills: Python\nTechnical Skills: React\nhello@example.com"),
    ("resume.pdf", ""),
])
def test_rejects_supporting_documents_even_with_resume_filename(filename, text):
    assert not is_valid_resume_content(text, filename, strict=True)[0]


@pytest.mark.parametrize("text", [
    RESUME,
    "Sam Shah\nsam@example.com\nEducation\nBA, 2026\nProjects\nCommunity garden",
    "Sam Shah\nsam@example.com\nWORK EXPERIENCE\nNurse, 2020 - Present\nEDUCATION\nBSc Nursing",
])
def test_accepts_nontechnical_and_fresher_resumes_with_generic_names(text):
    assert is_valid_resume_content(text, "document.pdf", strict=True)[0]


def test_resume_header_parser_extracts_title_and_date_range():
    text = (
        "Anita Rao\nSenior Software Engineer\nanita@example.com\n"
        "May 2021 - Present\nSkills: Python React"
    )
    assert extract_current_title(text) == "Senior Software Engineer"
    assert extract_experience_years(text) >= 4


def test_gmail_mixed_attachments_only_persist_resume(client, master, monkeypatch):
    from backend import gmail_service
    from backend.config import UPLOAD_DIR
    from backend.db import SessionLocal
    from backend.models import Candidate, EmailAccount, Organization
    from tests.helpers import make_company
    from pathlib import Path

    org_data, _ = make_company(client, master, "Resume Only", "resumes@example.com")
    attachments = [
        ("document.txt", RESUME),
        ("resume.txt", "Dear Hiring Manager,\nI am writing to apply.\n" + RESUME),
        ("course.txt", "Python React workshop\ntraining@example.com\nLearn technical skills."),
        ("details.txt", "This certifies that Anita completed the course.\n" + RESUME),
    ]

    class FakeGmail:
        def __init__(self, token):
            pass

        def list_thread_page(self, **kwargs):
            return {"threads": [{"id": "thread-1"}]}

        def list_messages(self, **kwargs):
            return []

        def get_thread(self, thread_id):
            return {"messages": [{"id": "message-1", "payload": {
                "headers": [{"name": "From", "value": "Anita <anita@example.com>"}],
                "parts": [{"filename": name, "mimeType": "text/plain", "body": {
                    "data": base64.urlsafe_b64encode(text.encode()).decode(),
                }} for name, text in attachments],
            }}]}

        def profile(self):
            return {}

    monkeypatch.setattr(gmail_service, "GmailClient", FakeGmail)
    monkeypatch.setattr(gmail_service, "ensure_access_token", lambda *args: "test-token")
    with SessionLocal() as db:
        org = db.get(Organization, org_data["id"])
        account = EmailAccount(organization_id=org.id, email="resumes@example.com")
        db.add(account)
        db.flush()
        before = set(Path(UPLOAD_DIR).rglob("cand_*"))
        summary = gmail_service._sync_gmail(db, org, account, actor_email="test")
        assert summary["ingested"] == 1
        assert summary["skipped"] == 3
        assert summary["errors"] == []
        candidates = db.query(Candidate).filter_by(organization_id=org.id).all()
        assert len(candidates) == 1
        assert candidates[0].resume_filename == "document.txt"
        assert len(set(Path(UPLOAD_DIR).rglob("cand_*")) - before) == 1


def test_gmail_page_query_has_no_date_or_subject_restrictions(monkeypatch):
    from backend.gmail_service import GmailClient
    calls = []
    def get(self, path, params):
        calls.append((path, params))
        return {"threads": [{"id": "old-thread"}]}
    monkeypatch.setattr(GmailClient, "_get", get)
    GmailClient("test").list_thread_page(page_token="older-page")
    assert calls == [("/threads", {
        "q": "has:attachment", "maxResults": 20,
        "includeSpamTrash": True, "pageToken": "older-page",
    })]


def test_deep_scan_pages_forwarded_profiles_and_new_replies(client, master, monkeypatch):
    from backend import gmail_service
    from backend.db import SessionLocal
    from backend.models import Candidate, EmailAccount, Organization
    from tests.helpers import make_company

    org_data, _ = make_company(client, master, "Full Mailbox", "mailbox@example.com")
    def message(mid, email):
        return {"id": mid, "payload": {
            "headers": [{"name": "From", "value": "Recruitment Agency <agency@example.com>"}],
            "parts": [{"filename": "Banking_Profile.txt", "mimeType": "text/plain", "body": {
                "data": base64.urlsafe_b64encode(RESUME.replace("anita@example.com", email).encode()).decode(),
            }}],
        }}
    threads = {"recent": [message("m1", "first@example.com")],
               "old": [message("m2", "second@example.com")]}
    class FakeGmail:
        def __init__(self, token): pass
        def list_thread_page(self, *, page_token=None, **kwargs):
            if page_token:
                assert page_token == "older"
                return {"threads": [{"id": "old"}]}
            return {"threads": [{"id": "recent"}], "nextPageToken": "older"}
        def get_thread(self, tid): return {"messages": threads[tid]}
        def profile(self): return {}
    monkeypatch.setattr(gmail_service, "GmailClient", FakeGmail)
    monkeypatch.setattr(gmail_service, "ensure_access_token", lambda *args: "test")
    with SessionLocal() as db:
        org = db.get(Organization, org_data["id"])
        account = EmailAccount(organization_id=org.id, email="mailbox@example.com")
        db.add(account)
        db.flush()
        first = gmail_service._sync_gmail(db, org, account, actor_email="test", full_scan=True)
        assert first["next_page_token"] == "older"
        assert not first["complete"]
        db.commit()
        second = gmail_service._sync_gmail(db, org, account, actor_email="test", full_scan=True, page_token="older")
        assert second["complete"]
        assert second["ingested"] == 2
        assert second["checked_emails"] == 2
        candidates = db.query(Candidate).filter_by(organization_id=org.id).all()
        assert {c.email for c in candidates} == {"first@example.com", "second@example.com"}
        assert all(c.name != "Recruitment Agency" for c in candidates)
        # A new attachment in an already processed thread is still imported.
        threads["recent"].append(message("m3", "third@example.com"))
        fresh = gmail_service._sync_gmail(db, org, account, actor_email="test")
        assert fresh["ingested"] == 1
        repeated = gmail_service._sync_gmail(db, org, account, actor_email="test", full_scan=True)
        assert repeated["ingested"] == 0
        assert repeated["duplicates"] == 2
        assert db.query(Candidate).filter_by(organization_id=org.id).count() == 3


def test_quota_pause_and_resume_keeps_successful_profiles(client, master, monkeypatch):
    from fastapi import HTTPException
    from backend import gmail_service, plans
    from backend.db import SessionLocal
    from backend.models import Candidate, EmailAccount, Organization
    from tests.helpers import make_company
    org_data, _ = make_company(client, master, "Quota Resume", "quota@example.com")
    state = {"blocked": True}
    original_check = plans.check_quota
    def check(db, org, metric, amount):
        if metric == "candidates" and state["blocked"] and db.query(Candidate).filter_by(organization_id=org.id).count() >= 1:
            raise HTTPException(402, "Candidate account limit reached. Upgrade the plan to continue.")
        return original_check(db, org, metric, amount)
    monkeypatch.setattr(plans, "check_quota", check)
    class FakeGmail:
        def __init__(self, token): pass
        def list_thread_page(self, **kwargs):
            return {"threads": [{"id": "t1"}]}
        def get_thread(self, tid):
            return {"messages": [{"id": "m1", "payload": {"parts": [
                {"filename": f"{i}.txt", "mimeType": "text/plain", "body": {"data": base64.urlsafe_b64encode(
                    RESUME.replace("anita@example.com", f"candidate{i}@example.com").encode()).decode()}}
                for i in range(2)
            ]}}]}
        def profile(self): return {}
    monkeypatch.setattr(gmail_service, "GmailClient", FakeGmail)
    monkeypatch.setattr(gmail_service, "ensure_access_token", lambda *args: "test")
    with SessionLocal() as db:
        org = db.get(Organization, org_data["id"])
        account = EmailAccount(organization_id=org.id, email="quota@example.com")
        db.add(account)
        db.flush()
        summary = gmail_service._sync_gmail(db, org, account, actor_email="test", full_scan=True)
        assert summary["paused"] and not summary["complete"]
        assert summary["ingested"] == 1
        assert "message:m1" not in account.last_sync_summary["processed"]
        db.commit()
        state["blocked"] = False
        summary = gmail_service._sync_gmail(db, org, account, actor_email="test", resume=True)
        assert summary["complete"] and not summary["paused"]
        assert summary["ingested"] == 2
        assert db.query(Candidate).filter_by(organization_id=org.id).count() == 2
        assert plans.get_usage(db, org.id, "resume_parses") == 2


@pytest.mark.skipif(not __import__('shutil').which('tesseract'), reason='Tesseract integration dependency')
def test_gmail_generic_image_imports_candidate_and_read_failures_retry(client, master, monkeypatch):
    from backend import gmail_service
    from backend.db import SessionLocal
    from backend.models import Candidate, EmailAccount, Organization
    from tests.helpers import make_company
    from tests.test_document_reader import image_resume
    org_data, _ = make_company(client, master, "Image Mailbox", "images@example.com")
    png = image_resume()
    class FakeGmail:
        def __init__(self, token): pass
        def list_thread_page(self, **kwargs): return {"threads": [{"id": "t1"}]}
        def get_thread(self, tid):
            return {"messages": [{"id": "m1", "payload": {"parts": [
                {"filename": "attachment.png", "mimeType": "image/png", "body": {"data": base64.urlsafe_b64encode(png).decode()}},
                {"filename": "broken.pdf", "mimeType": "application/pdf", "body": {"data": base64.urlsafe_b64encode(b"%PDF-" + b"broken" * 20).decode()}},
            ]}}]}
        def profile(self): return {}
    monkeypatch.setattr(gmail_service, "GmailClient", FakeGmail)
    monkeypatch.setattr(gmail_service, "ensure_access_token", lambda *args: "test")
    with SessionLocal() as db:
        org = db.get(Organization, org_data["id"])
        account = EmailAccount(organization_id=org.id, email="images@example.com")
        db.add(account)
        db.flush()
        summary = gmail_service._sync_gmail(db, org, account, actor_email="test")
        assert summary["ingested"] == 1
        assert summary["failed"] == 1
        assert not summary["complete"]
        assert "message:m1" not in account.last_sync_summary["processed"]
        candidate = db.query(Candidate).filter_by(organization_id=org.id).one()
        assert candidate.email == "anita@example.com"
        assert candidate.resume_filename == "attachment.png"
        assert "damaged" in summary["errors"][0]
