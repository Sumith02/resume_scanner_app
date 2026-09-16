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


class SignedLocalRepository(LocalRepository):
    def create_signed_upload(self, path: str) -> dict[str, str]:
        return {"token": "test-upload-token", "signed_url": f"https://storage.test/{path}"}


def _test_services(tmp_path: Path, *, production_storage: bool = False) -> main.Services:
    settings = Settings(
        environment="test",
        app_origin="http://testserver",
        supabase_url="https://project.supabase.co" if production_storage else "",
        supabase_public_key="test-public-key" if production_storage else "",
        supabase_secret_key="test-secret-key" if production_storage else "",
        auth_required=False,
        allow_demo_mode=True,
        google_client_id="",
        google_client_secret="",
        google_redirect_uri="",
        oauth_state_secret="test-state-secret",
        token_encryption_key="test-encryption-secret",
        resend_api_key="",
        mail_from="",
    )
    services = main.Services.__new__(main.Services)
    services.settings = settings
    services.error = None
    services.repository = SignedLocalRepository(tmp_path) if production_storage else LocalRepository(tmp_path)
    services.auth = AuthService(settings, services.repository)
    services.resumes = ResumeService(settings, services.repository)
    services.gmail = GmailService(settings, services.repository, services.resumes)
    services.email = EmailService(settings)
    services.upload_state = SignedState(settings.oauth_state_secret, max_age_seconds=2 * 60 * 60)
    return services


def test_application_workflow(tmp_path: Path, monkeypatch) -> None:
    test_services = _test_services(tmp_path)
    monkeypatch.setattr(main, "services", test_services)
    monkeypatch.setattr(main, "settings", test_services.settings)
    client = TestClient(main.app)

    upload = client.post(
        "/api/applications",
        data={"role": "Backend Engineer", "source": "Test upload"},
        files={
            "resumes": (
                "aarav.txt",
                b"Aarav Nair\naarav@example.com\nPython FastAPI PostgreSQL\n5 years",
                "text/plain",
            )
        },
    )
    assert upload.status_code == 201
    application = upload.json()["applications"][0]
    assert application["email"] == "aarav@example.com"

    update = client.patch(f"/api/applications/{application['id']}", json={"status": "shortlisted"})
    assert update.status_code == 200
    assert update.json()["application"]["status"] == "shortlisted"

    report = client.get("/api/reports/summary")
    assert report.status_code == 200
    assert report.json()["report"]["total"] == 1

    team = client.get("/api/team/members")
    assert team.status_code == 200
    assert team.json()["members"][0]["role"] == "owner"

    delete = client.delete(f"/api/applications/{application['id']}")
    assert delete.status_code == 204


def test_duplicate_applications_are_skipped(tmp_path: Path, monkeypatch) -> None:
    test_services = _test_services(tmp_path)
    monkeypatch.setattr(main, "services", test_services)
    monkeypatch.setattr(main, "settings", test_services.settings)
    client = TestClient(main.app)

    # First upload
    res1 = client.post(
        "/api/applications",
        data={"role": "Backend Engineer", "source": "Test upload"},
        files={
            "resumes": (
                "dev.txt",
                b"Rohan Varma\nrohan@example.com\nPython Docker Kubernetes\n4 years",
                "text/plain",
            )
        },
    )
    assert res1.status_code == 201
    assert len(res1.json()["applications"]) == 1

    # Second upload with same candidate email & checksum
    res2 = client.post(
        "/api/applications",
        data={"role": "Backend Engineer", "source": "Test upload"},
        files={
            "resumes": (
                "dev.txt",
                b"Rohan Varma\nrohan@example.com\nPython Docker Kubernetes\n4 years",
                "text/plain",
            )
        },
    )
    assert res2.status_code == 201
    # Must be skipped, NOT duplicated in applications list
    assert len(res2.json()["applications"]) == 0



def test_signed_storage_upload_workflow(tmp_path: Path, monkeypatch) -> None:
    test_services = _test_services(tmp_path, production_storage=True)
    monkeypatch.setattr(main, "services", test_services)
    monkeypatch.setattr(main, "settings", test_services.settings)
    client = TestClient(main.app)
    resume = b"Maya Rao\nmaya@example.com\nPython FastAPI PostgreSQL\n6 years"

    signed = client.post(
        "/api/uploads/sign",
        json={"files": [{"name": "maya.txt", "size": len(resume), "mimeType": "text/plain"}]},
    )
    assert signed.status_code == 200
    manifest = signed.json()
    upload = manifest["uploads"][0]
    test_services.repository.upload_resume(upload["path"], resume, "text/plain")

    processed = client.post(
        "/api/uploads/process",
        json={
            "completionToken": manifest["completionToken"],
            "role": "Backend Engineer",
            "source": "Direct upload",
        },
    )
    assert processed.status_code == 201
    repeated = client.post(
        "/api/uploads/process",
        json={
            "completionToken": manifest["completionToken"],
            "role": "Backend Engineer",
            "source": "Direct upload",
        },
    )
    assert repeated.status_code == 201
    assert repeated.json()["applications"] == []


def test_delete_candidate_workflow(tmp_path: Path, monkeypatch) -> None:
    test_services = _test_services(tmp_path)
    monkeypatch.setattr(main, "services", test_services)
    monkeypatch.setattr(main, "settings", test_services.settings)
    client = TestClient(main.app)

    upload = client.post(
        "/api/applications",
        data={"role": "Backend Engineer", "source": "Test upload"},
        files={
            "resumes": (
                "kavita.txt",
                b"Kavita Reddy\nkavita@example.com\nPython AWS Docker\n5 years",
                "text/plain",
            )
        },
    )
    assert upload.status_code == 201
    cand_id = upload.json()["applications"][0]["id"]

    # Delete candidate
    del_res = client.delete(f"/api/candidates/{cand_id}")
    assert del_res.status_code == 204


def test_rediscovery_and_natural_search_robustness(tmp_path: Path, monkeypatch) -> None:
    test_services = _test_services(tmp_path)
    monkeypatch.setattr(main, "services", test_services)
    monkeypatch.setattr(main, "settings", test_services.settings)
    client = TestClient(main.app)

    # Empty search query must not error with 422
    empty_search = client.post("/api/search/natural", json={"query": ""})
    assert empty_search.status_code == 200

    # Rediscovery with no jobs and empty jobId must succeed
    rediscovery_res = client.post("/api/rediscovery", json={"jobId": "", "minScore": 50})
    assert rediscovery_res.status_code == 200
    assert "metrics" in rediscovery_res.json()


def test_team_provisioning_and_password_lifecycle(tmp_path: Path, monkeypatch) -> None:
    test_services = _test_services(tmp_path)
    monkeypatch.setattr(main, "services", test_services)
    monkeypatch.setattr(main, "settings", test_services.settings)
    client = TestClient(main.app)

    # 1. Provision a new recruiter account with auto-generated temporary password
    provision_res = client.post(
        "/api/team/provision",
        json={
            "email": "recruiter.alex@enterprise.com",
            "fullName": "Alex Rivera",
            "role": "recruiter",
        },
    )
    assert provision_res.status_code == 201
    data = provision_res.json()
    assert data["member"]["email"] == "recruiter.alex@enterprise.com"
    assert data["member"]["role"] == "recruiter"
    assert data["member"]["mustChangePassword"] is True
    assert len(data["temporaryPassword"]) >= 8

    # 2. Team members list reflects the provisioned account with pending first login
    members_res = client.get("/api/team/members")
    assert members_res.status_code == 200
    members = members_res.json()["members"]
    provisioned = next((m for m in members if m["email"] == "recruiter.alex@enterprise.com"), None)
    assert provisioned is not None
    assert provisioned["mustChangePassword"] is True

    # 3. Completing password change updates user status
    pwd_res = client.post("/api/auth/complete-password-change")
    assert pwd_res.status_code == 200
    assert pwd_res.json()["status"] == "success"


def test_master_admin_sumithsbhatt_unconditional_access(tmp_path: Path, monkeypatch) -> None:
    test_services = _test_services(tmp_path)
    monkeypatch.setattr(main, "services", test_services)
    monkeypatch.setattr(main, "settings", test_services.settings)
    client = TestClient(main.app)

    # 1. Check me endpoint - should return owner role
    me_res = client.get("/api/me")
    assert me_res.status_code == 200
    assert me_res.json()["workspace"]["role"] == "owner"
    assert me_res.json()["user"]["mustChangePassword"] is False

    # 2. Check team members endpoint - should return owner role for current user
    members_res = client.get("/api/team/members")
    assert members_res.status_code == 200
    assert members_res.json()["currentUserRole"] == "owner"


def test_master_bootstrap_endpoint(tmp_path: Path, monkeypatch) -> None:
    test_services = _test_services(tmp_path)
    monkeypatch.setattr(main, "services", test_services)
    monkeypatch.setattr(main, "settings", test_services.settings)
    client = TestClient(main.app)

    # 1. Successful master admin bootstrap
    res = client.post(
        "/api/auth/master-bootstrap",
        json={"email": "sumithsbhatt@gmail.com", "password": "SuperSecretPassword123!"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "success"

    # 2. Rejection for non-master email
    bad_res = client.post(
        "/api/auth/master-bootstrap",
        json={"email": "attacker@example.com", "password": "SuperSecretPassword123!"},
    )
    assert bad_res.status_code == 422

    # 3. Rejection for short password
    short_res = client.post(
        "/api/auth/master-bootstrap",
        json={"email": "sumithsbhatt@gmail.com", "password": "short"},
    )
    assert short_res.status_code == 422


