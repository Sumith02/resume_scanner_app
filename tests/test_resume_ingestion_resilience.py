from pathlib import Path
from fastapi.testclient import TestClient

from backend import main
from backend.classifier import is_candidate_resume
from backend.gmail_service import DEFAULT_QUERY
from backend.models import RequestContext
from backend.repository import LocalRepository
from tests.test_api import _test_services


def test_classifier_accepts_various_candidate_filenames_and_structures() -> None:
    sample_text = """
    Sumith Bhatt
    Email: sumith@example.com | Phone: +91 98765 43210
    Full Stack Developer with 5 years experience
    Skills: Python, TypeScript, React, PostgreSQL, Docker, AWS
    Education: B.Tech in Computer Science
    """

    # Valid candidate resumes with edge case filenames that previously failed
    filenames = [
        "Sumith_BTech_Degree.pdf",
        "Billy_Profile.pdf",
        "Contract_Developer_John.pdf",
        "CamScanner_09_17_2026.pdf",
        "Alex_Smith.pdf",
        "Jane_Doe_CV.pdf",
        "portfolio_resume.pdf",
    ]
    for fn in filenames:
        valid, reason = is_candidate_resume(sample_text, fn)
        assert valid is True, f"Failed for {fn}: {reason}"


def test_classifier_still_rejects_actual_invoices_and_boarding_passes() -> None:
    invoice_text = "Tax Invoice #8891\nBill To: Acme Corp\nAmount Due: $500\nTotal Payable: $500\nBank Details: IFSC0001"
    valid, reason = is_candidate_resume(invoice_text, "tax_invoice.pdf")
    assert valid is False
    assert "rejected" in reason.lower()

    ticket_text = "Boarding Pass\nFlight Number: AI 202\nGate: 12A\nBaggage: 20kg"
    valid, reason = is_candidate_resume(ticket_text, "flight_ticket.pdf")
    assert valid is False


def test_upload_duplicate_reports_informative_failure_message(tmp_path: Path, monkeypatch) -> None:
    services = _test_services(tmp_path)
    monkeypatch.setattr(main, "services", services)
    client = TestClient(main.app)

    resume_payload = (
        "candidate_resume.txt",
        b"Kiran Iyer\nkiran@example.com\n+91 99887 76655\nSkills: Python, React, SQL\n4 years experience",
        "text/plain",
    )

    # First upload succeeds
    res1 = client.post(
        "/api/applications",
        files={"resumes": resume_payload},
        data={"role": "Software Engineer", "source": "Direct upload"},
    )
    assert res1.status_code == 201
    data1 = res1.json()
    assert len(data1["applications"]) == 1
    assert data1["message"] == "1 resume processed"

    # Second upload of same candidate reports duplicate clearly without silent failure
    res2 = client.post(
        "/api/applications",
        files={"resumes": resume_payload},
        data={"role": "Software Engineer", "source": "Direct upload"},
    )
    assert res2.status_code == 201
    data2 = res2.json()
    assert len(data2["applications"]) == 0
    assert len(data2["failures"]) == 1
    assert "already indexed in your workspace" in data2["failures"][0]["message"]
    assert "already indexed" in data2["message"]


def test_gmail_default_query_broadly_searches_attachments() -> None:
    # Broader query ensures emails without specific body keywords (e.g. "PFA my profile") are not missed
    assert "filename:pdf" in DEFAULT_QUERY
    assert "filename:docx" in DEFAULT_QUERY
    assert "has:attachment" in DEFAULT_QUERY


def test_workspace_isolation_and_ownership(tmp_path: Path) -> None:
    repo = LocalRepository(tmp_path)
    ctx_admin = RequestContext(
        user_id="usr-master",
        email="sumithsbhatt@gmail.com",
        organization_id="org-master",
        role="owner",
        authenticated=True,
    )
    ctx_recruiter1 = RequestContext(
        user_id="usr-rec-1",
        email="recruiter1@company.com",
        organization_id="org-rec-1",
        role="recruiter",
        authenticated=True,
    )

    app_admin = {
        "id": "app-admin-1",
        "candidateName": "Admin Candidate",
        "email": "admin.cand@example.com",
        "phone": "555-1111",
        "location": "NY",
        "city": "",
        "region": "",
        "country": "",
        "locationConfidence": 0,
        "primarySkill": "Backend",
        "primarySkillKey": "backend",
        "skillScores": {},
        "skillScorePercent": 80,
        "matchedSkills": ["Python"],
        "experienceYears": 5,
        "summary": "Admin summary",
        "textPreview": "Admin preview",
        "resumeTextLength": 100,
        "originalName": "admin.pdf",
        "storedName": "admin.pdf",
        "fileChecksum": "chk-admin",
        "sourceExternalId": None,
        "mimeType": "application/pdf",
        "fileSize": 100,
        "uploadedAt": "2026-09-17T00:00:00Z",
        "updatedAt": "2026-09-17T00:00:00Z",
        "source": "Direct upload",
        "role": "Engineer",
        "status": "new",
        "notes": "",
        "tags": [],
        "duplicateOf": None,
    }

    app_recruiter = {
        "id": "app-rec-1",
        "candidateName": "Recruiter Candidate",
        "email": "rec.cand@example.com",
        "phone": "555-2222",
        "location": "SF",
        "city": "",
        "region": "",
        "country": "",
        "locationConfidence": 0,
        "primarySkill": "Frontend",
        "primarySkillKey": "frontend",
        "skillScores": {},
        "skillScorePercent": 80,
        "matchedSkills": ["React"],
        "experienceYears": 3,
        "summary": "Recruiter summary",
        "textPreview": "Recruiter preview",
        "resumeTextLength": 100,
        "originalName": "recruiter.pdf",
        "storedName": "recruiter.pdf",
        "fileChecksum": "chk-recruiter",
        "sourceExternalId": None,
        "mimeType": "application/pdf",
        "fileSize": 100,
        "uploadedAt": "2026-09-17T00:00:00Z",
        "updatedAt": "2026-09-17T00:00:00Z",
        "source": "Direct upload",
        "role": "Engineer",
        "status": "new",
        "notes": "",
        "tags": [],
        "duplicateOf": None,
    }

    repo.insert_applications([app_admin], ctx_admin)
    repo.insert_applications([app_recruiter], ctx_recruiter1)

    admin_apps = repo.list_applications(ctx_admin)
    recruiter_apps = repo.list_applications(ctx_recruiter1)

    # Recruiter sees only their own candidate
    assert len(recruiter_apps) == 1
    assert recruiter_apps[0]["id"] == "app-rec-1"

    # Master admin sees master applications
    assert any(a["id"] == "app-admin-1" for a in admin_apps)
