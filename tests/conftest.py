import os
import tempfile

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db.name}"
os.environ["JWT_SECRET"] = "test-secret-key-with-enough-length-0123456789"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="nexerra-uploads-")
os.environ["DEMO_INBOX_DIR"] = tempfile.mkdtemp(prefix="nexerra-inbox-")

import pytest
from fastapi.testclient import TestClient

from backend.db import Base, engine
from backend.main import app


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def master(client):
    r = client.post("/api/auth/bootstrap", json={})
    assert r.status_code == 200, r.text
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@nexerra.io", "password": "Admin@12345"},
    )
    return login.json()["access_token"]