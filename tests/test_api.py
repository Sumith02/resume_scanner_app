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

