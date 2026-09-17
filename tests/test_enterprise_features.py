from pathlib import Path

from fastapi.testclient import TestClient

from backend import main
from backend.auth import AuthService
from backend.config import Settings
from backend.crypto import SignedState
from backend.email_service import EmailService
from backend.gmail_service import GmailService
from backend.repository import LocalRepository
from backend.resume_service import ResumeService


def _setup_test_env(tmp_path: Path, monkeypatch) -> TestClient:
    settings = Settings(
        environment="test",
        app_origin="http://testserver",
        supabase_url="",
        supabase_public_key="",
        supabase_secret_key="",
        auth_required=False,
        allow_demo_mode=True,
        google_client_id="",
        google_client_secret="",
        google_redirect_uri="",
        oauth_state_secret="test-state-secret-32-chars-minimum-length",
        token_encryption_key="test-encryption-key-32-chars-minimum",
        resend_api_key="",
        mail_from="",
    )
    services = main.Services.__new__(main.Services)
    services.settings = settings
    services.error = None
    services.repository = LocalRepository(tmp_path)
    services.auth = AuthService(settings, services.repository)
    services.resumes = ResumeService(settings, services.repository)
    services.gmail = GmailService(settings, services.repository, services.resumes)
    services.email = EmailService(settings)
    services.upload_state = SignedState(settings.oauth_state_secret, max_age_seconds=7200)

    monkeypatch.setattr(main, "services", services)
    monkeypatch.setattr(main, "settings", services.settings)
    return TestClient(main.app)


def test_tenant_data_isolation(tmp_path: Path, monkeypatch):
    client = _setup_test_env(tmp_path, monkeypatch)

    # User 1 signs in and uploads a candidate
    auth_user1 = {"Authorization": "Bearer local:recruiter1@company-a.com"}
    upload1 = client.post(
        "/api/applications",
        headers=auth_user1,
        data={"role": "Backend Engineer", "source": "Company A Intake"},
        files={
            "resumes": (
                "alice.txt",
                b"Alice Walker\nEmail: alice@companya.com\nPython, FastAPI, AWS, Docker.\n5 years backend engineer at Acme.",
                "text/plain",
            )
        },
    )
    assert upload1.status_code == 201
    assert len(upload1.json()["applications"]) == 1

    # User 1 sees the candidate
    res1 = client.get("/api/applications", headers=auth_user1)
    assert res1.status_code == 200
    assert any(a["candidateName"] == "Alice Walker" for a in res1.json()["applications"])

    # User 2 signs in from a different organization
    auth_user2 = {"Authorization": "Bearer local:recruiter2@company-b.com"}
    res2 = client.get("/api/applications", headers=auth_user2)
    assert res2.status_code == 200
    # User 2 CANNOT see User 1's candidate
    assert not any(a["candidateName"] == "Alice Walker" for a in res2.json()["applications"])


def test_enterprise_ats_interviews_and_scorecards(tmp_path: Path, monkeypatch):
    client = _setup_test_env(tmp_path, monkeypatch)
    auth_header = {"Authorization": "Bearer local:recruiter@vithsutra.com"}

    # 1. Ingest a candidate first
    upload = client.post(
        "/api/applications",
        headers=auth_header,
        data={"role": "Fullstack Engineer", "source": "Direct"},
        files={
            "resumes": (
                "john.txt",
                b"John Doe\nEmail: john@example.com\nReact, TypeScript, Node.js.\n4 years experience.",
                "text/plain",
            )
        },
    )
    cand_id = upload.json()["applications"][0]["id"]

    # 2. Schedule interview
    interview_res = client.post(
        "/api/interviews",
        headers=auth_header,
        json={
            "candidateId": cand_id,
            "title": "System Design Round",
            "interviewType": "system_design",
            "interviewerName": "Lead Architect",
            "scheduledAt": "2026-09-20T10:00:00Z",
            "meetingLink": "https://meet.google.com/test-room",
        },
    )
    assert interview_res.status_code == 201
    interview = interview_res.json()["interview"]
    assert interview["title"] == "System Design Round"
    assert interview["status"] == "scheduled"

    # 3. Submit Scorecard
    scorecard_res = client.post(
        f"/api/interviews/{interview['id']}/scorecard",
        headers=auth_header,
        json={
            "interviewPlanId": interview["id"],
            "candidateId": cand_id,
            "interviewerName": "Lead Architect",
            "technicalRating": 5,
            "communicationRating": 4,
            "problemSolvingRating": 5,
            "cultureFitRating": 4,
            "overallRecommendation": "strong_hire",
            "strengths": "Deep knowledge of distributed systems and event-driven architecture.",
            "concerns": "None observed.",
            "detailedFeedback": "Excellent candidate for staff level.",
        },
    )
    assert scorecard_res.status_code == 201
    assert scorecard_res.json()["scorecard"]["overallRecommendation"] == "strong_hire"

    # 4. Fetch candidate interviews
    cand_interviews = client.get(f"/api/candidates/{cand_id}/interviews", headers=auth_header)
    assert cand_interviews.status_code == 200
    assert len(cand_interviews.json()["interviews"]) == 1
    assert len(cand_interviews.json()["scorecards"]) == 1


def test_pipeline_movement_and_offers(tmp_path: Path, monkeypatch):
    client = _setup_test_env(tmp_path, monkeypatch)
    auth_header = {"Authorization": "Bearer local:recruiter@vithsutra.com"}

    upload = client.post(
        "/api/applications",
        headers=auth_header,
        data={"role": "DevOps Engineer"},
        files={
            "resumes": (
                "devops.txt",
                b"Sam Brown\nEmail: sam@cloud.com\nKubernetes, Terraform, AWS, Docker.\n6 years.",
                "text/plain",
            )
        },
    )
    cand_id = upload.json()["applications"][0]["id"]

    # Move stage to shortlisted
    move_res = client.post(
        "/api/pipeline/move",
        headers=auth_header,
        json={"candidateId": cand_id, "toStage": "shortlisted", "reason": "Passed technical assessment"},
    )
    assert move_res.status_code == 200
    assert move_res.json()["toStage"] == "shortlisted"

    # Check stage history
    hist = client.get(f"/api/candidates/{cand_id}/stage-history", headers=auth_header)
    assert hist.status_code == 200
    assert len(hist.json()["history"]) >= 1

    # Create job offer
    offer_res = client.post(
        "/api/offers",
        headers=auth_header,
        json={
            "candidateId": cand_id,
            "baseSalary": 2200000,
            "currency": "INR",
            "bonus": 250000,
            "equity": "0.1%",
            "joiningDate": "2026-10-15",
            "expirationDate": "2026-10-01",
        },
    )
    assert offer_res.status_code == 201
    offer_id = offer_res.json()["offer"]["id"]

    # Update offer status to accepted
    patch_offer = client.patch(f"/api/offers/{offer_id}/status", headers=auth_header, json={"status": "accepted"})
    assert patch_offer.status_code == 200
    assert patch_offer.json()["offer"]["status"] == "accepted"


def test_agency_and_compliance(tmp_path: Path, monkeypatch):
    client = _setup_test_env(tmp_path, monkeypatch)
    auth_header = {"Authorization": "Bearer local:recruiter@vithsutra.com"}

    # Agency client jobs & invoices
    job_res = client.post(
        "/api/agency/clients/client-a/jobs",
        headers=auth_header,
        json={"clientId": "client-a", "title": "Staff Platform Engineer", "department": "Infra", "targetHires": 2},
    )
    assert job_res.status_code == 201
    assert job_res.json()["job"]["title"] == "Staff Platform Engineer"

    # Invoice creation
    inv_res = client.post(
        "/api/agency/invoices",
        headers=auth_header,
        json={"clientId": "client-a", "invoiceNumber": "INV-2026-001", "amount": 450000, "currency": "INR"},
    )
    assert inv_res.status_code == 201
    assert inv_res.json()["invoice"]["invoiceNumber"] == "INV-2026-001"

    # Compliance export
    export_res = client.post(
        "/api/compliance/export",
        headers=auth_header,
        json={"exportType": "candidates_full", "format": "json"},
    )
    assert export_res.status_code == 200
    assert "exportId" in export_res.json()


def test_role_based_permissions_and_scoping(tmp_path: Path, monkeypatch):
    client = _setup_test_env(tmp_path, monkeypatch)
    admin_auth = {"Authorization": "Bearer local:sumithsbhatt@gmail.com"}

    # 1. Admin checks /api/me
    me_admin = client.get("/api/me", headers=admin_auth)
    assert me_admin.status_code == 200
    assert me_admin.json()["user"]["role"] == "owner"

    # 2. Admin provisions a recruiter
    prov_res = client.post(
        "/api/team/provision",
        headers=admin_auth,
        json={"email": "recruiter1@company.com", "fullName": "Jane Recruiter", "role": "recruiter"},
    )
    assert prov_res.status_code == 201

    # 3. Recruiter checks /api/me
    recruiter_auth = {"Authorization": "Bearer local:recruiter1@company.com"}
    me_recruiter = client.get("/api/me", headers=recruiter_auth)
    assert me_recruiter.status_code == 200
    assert me_recruiter.json()["user"]["role"] == "recruiter"
    # Belongs to same organization as admin
    assert me_recruiter.json()["workspace"]["id"] == me_admin.json()["workspace"]["id"]

    # 4. Recruiter tries to provision another user - must be 403 Forbidden!
    forbidden_prov = client.post(
        "/api/team/provision",
        headers=recruiter_auth,
        json={"email": "hacker@test.com", "role": "admin"},
    )
    assert forbidden_prov.status_code == 403


def test_strict_per_user_isolation(tmp_path: Path, monkeypatch):
    client = _setup_test_env(tmp_path, monkeypatch)

    admin_auth = {"Authorization": "Bearer local:sumithsbhatt@gmail.com"}
    user1_auth = {"Authorization": "Bearer local:recruiter.one@example.com"}
    user2_auth = {"Authorization": "Bearer local:recruiter.two@example.com"}

    # Initially user1 has 0 candidates
    assert len(client.get("/api/candidates", headers=user1_auth).json()["candidates"]) == 0

    # User 1 uploads a resume
    up1 = client.post(
        "/api/applications",
        headers=user1_auth,
        data={"role": "Backend Engineer", "source": "User 1 Upload"},
        files={
            "resumes": (
                "alex.txt",
                b"Alex Smith\nEmail: alex@example.com\nPython FastAPI\n3 years experience.",
                "text/plain",
            )
        },
    )
    assert up1.status_code == 201

    # User 1 sees their 1 candidate
    user1_cands = client.get("/api/candidates", headers=user1_auth).json()["candidates"]
    assert len(user1_cands) == 1
    assert user1_cands[0]["canonicalName"] == "Alex Smith"

    # User 2 logs in: must see 0 candidates!
    user2_cands = client.get("/api/candidates", headers=user2_auth).json()["candidates"]
    assert len(user2_cands) == 0

    # User 2 uploads a candidate
    up2 = client.post(
        "/api/applications",
        headers=user2_auth,
        data={"role": "Frontend Engineer", "source": "User 2 Upload"},
        files={
            "resumes": (
                "sarah.txt",
                b"Sarah Connor\nEmail: sarah@example.com\nReact TypeScript\n6 years experience.",
                "text/plain",
            )
        },
    )
    assert up2.status_code == 201

    # User 2 sees only Sarah Connor
    user2_cands_after = client.get("/api/candidates", headers=user2_auth).json()["candidates"]
    assert len(user2_cands_after) == 1
    assert user2_cands_after[0]["canonicalName"] == "Sarah Connor"

    # User 1 still sees only Alex Smith
    user1_cands_after = client.get("/api/candidates", headers=user1_auth).json()["candidates"]
    assert len(user1_cands_after) == 1
    assert user1_cands_after[0]["canonicalName"] == "Alex Smith"

    # Admin does NOT see Alex Smith or Sarah Connor
    admin_cands = client.get("/api/candidates", headers=admin_auth).json()["candidates"]
    assert not any(c["canonicalName"] in ("Alex Smith", "Sarah Connor") for c in admin_cands)

