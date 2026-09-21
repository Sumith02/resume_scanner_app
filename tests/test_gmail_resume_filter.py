import base64

import pytest

from backend.resume_service import is_valid_resume_content


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

        def list_threads(self, **kwargs):
            return ["thread-1"]

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
