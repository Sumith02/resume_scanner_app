from tests.conftest import auth_headers


def test_bootstrap_and_login(client):
    r = client.post("/api/auth/bootstrap", json={})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "MASTER_ADMIN"

    # Second bootstrap is rejected.
    assert client.post("/api/auth/bootstrap", json={}).status_code == 409

    login = client.post(
        "/api/auth/login",
        json={"email": "admin@nexerra.io", "password": "Admin@12345"},
    )
    assert login.status_code == 200
    assert login.json()["user"]["scope"] == "platform"


def test_bad_login(client):
    client.post("/api/auth/bootstrap", json={})
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@nexerra.io", "password": "wrong-password"},
    )
    assert r.status_code == 401


def test_provision_company_and_accept_invite(client):
    master = master_token(client)
    r = client.post(
        "/api/master/companies",
        json={"name": "Acme Recruiting", "email": "owner@acme.dev", "seat_limit": 3},
        headers=auth_headers(master),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["company"]["status"] == "INVITATION_SENT"
    assert body["company"]["seats"]["limit"] == 3
    token = body["invite_token"]

    accept = client.post(
        "/api/auth/accept-invite",
        json={
            "email": "owner@acme.dev",
            "token": token,
            "password": "Sup3rS3cret!",
        },
    )
    assert accept.status_code == 200, accept.text
    assert accept.json()["user"]["role"] == "COMPANY_OWNER"
    assert accept.json()["user"]["scope"] == "company"

    login = client.post(
        "/api/auth/login",
        json={"email": "owner@acme.dev", "password": "Sup3rS3cret!"},
    )
    assert login.status_code == 200


def test_master_company_lifecycle(client):
    master = master_token(client)
    r = client.post(
        "/api/master/companies",
        json={"name": "Beta Ltd", "email": "beta@test.com", "seat_limit": 5},
        headers=auth_headers(master),
    )
    org_id = r.json()["company"]["id"]

    susp = client.patch(
        f"/api/master/companies/{org_id}/status",
        json={"status": "SUSPENDED"},
        headers=auth_headers(master),
    )
    assert susp.status_code == 200
    assert susp.json()["company"]["status"] == "SUSPENDED"

    react = client.patch(
        f"/api/master/companies/{org_id}/status",
        json={"status": "ACTIVE"},
        headers=auth_headers(master),
    )
    assert react.status_code == 200

    deact = client.patch(
        f"/api/master/companies/{org_id}/status",
        json={"status": "DEACTIVATED"},
        headers=auth_headers(master),
    )
    assert deact.status_code == 200
    assert deact.json()["company"]["status"] == "DEACTIVATED"


def test_master_stats(client):
    master = master_token(client)
    client.post(
        "/api/master/companies",
        json={"name": "Gamma", "email": "gamma@test.com", "seat_limit": 4},
        headers=auth_headers(master),
    )
    client.post(
        "/api/master/companies",
        json={"name": "Delta", "email": "delta@test.com", "seat_limit": 6},
        headers=auth_headers(master),
    )
    stats = client.get("/api/master/stats", headers=auth_headers(master))
    assert stats.json()["organizations"] == 2
    assert stats.json()["total_seats"] == 10


def test_master_seat_approval(client):
    master = master_token(client)
    r = client.post(
        "/api/master/companies",
        json={"name": "Epsilon", "email": "eps@test.com", "seat_limit": 2},
        headers=auth_headers(master),
    )
    token = r.json()["invite_token"]
    org_id = r.json()["company"]["id"]
    client.post(
        "/api/auth/accept-invite",
        json={"email": "eps@test.com", "token": token, "password": "Passw0rd!123"},
    )

    owner = client.post(
        "/api/auth/login", json={"email": "eps@test.com", "password": "Passw0rd!123"}
    ).json()["access_token"]

    req = client.post(
        "/api/org/seats/request", json={"reason": "Scaling team"}, headers=auth_headers(owner)
    )
    assert req.status_code == 200

    pending = client.get("/api/master/seat-requests", headers=auth_headers(master))
    assert pending.status_code == 200
    req_id = pending.json()[0]["id"]
    assert pending.json()[0]["requested_seats"] == 3

    approve = client.post(
        f"/api/master/seat-requests/{req_id}/review",
        json={"approve": True},
        headers=auth_headers(master),
    )
    assert approve.status_code == 200

    companies = client.get("/api/master/companies", headers=auth_headers(master))
    company = next(c for c in companies.json() if c["id"] == org_id)
    assert company["seat_limit"] == 3


def test_master_requires_master(client):
    master = master_token(client)
    r = client.post(
        "/api/master/companies",
        json={"name": "Zeta", "email": "zeta@test.com", "seat_limit": 1},
        headers=auth_headers(master),
    )
    token = r.json()["invite_token"]
    client.post(
        "/api/auth/accept-invite",
        json={"email": "zeta@test.com", "token": token, "password": "Passw0rd!123"},
    )
    owner = client.post(
        "/api/auth/login", json={"email": "zeta@test.com", "password": "Passw0rd!123"}
    ).json()["access_token"]

    forbidden = client.get("/api/master/companies", headers=auth_headers(owner))
    assert forbidden.status_code == 403


def master_token(client):
    client.post("/api/auth/bootstrap", json={})
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@nexerra.io", "password": "Admin@12345"},
    )
    return login.json()["access_token"]


def test_change_password_flow(client):
    master = master_token(client)
    r = client.post(
        "/api/master/companies",
        json={"name": "Password Co", "email": "owner@pwd.dev", "seat_limit": 3},
        headers=auth_headers(master),
    )
    client.post(
        "/api/auth/accept-invite",
        json={
            "email": "owner@pwd.dev",
            "token": r.json()["invite_token"],
            "password": "OldPass!123",
        },
    )
    token = client.post(
        "/api/auth/login", json={"email": "owner@pwd.dev", "password": "OldPass!123"}
    ).json()["access_token"]

    wrong = client.post(
        "/api/auth/change-password",
        json={"current_password": "not-it", "new_password": "NewPass!123"},
        headers=auth_headers(token),
    )
    assert wrong.status_code == 400

    ok = client.post(
        "/api/auth/change-password",
        json={"current_password": "OldPass!123", "new_password": "NewPass!123"},
        headers=auth_headers(token),
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["must_change_password"] is False

    stale = client.post(
        "/api/auth/login", json={"email": "owner@pwd.dev", "password": "OldPass!123"}
    )
    assert stale.status_code == 401

    fresh = client.post(
        "/api/auth/login", json={"email": "owner@pwd.dev", "password": "NewPass!123"}
    )
    assert fresh.status_code == 200


def test_must_change_password_is_surfaced_and_invited_login_allowed(client):
    from backend.db import SessionLocal
    from backend.models import User

    master = master_token(client)
    r = client.post(
        "/api/master/companies",
        json={"name": "Flag Co", "email": "flag@flag.dev", "seat_limit": 2},
        headers=auth_headers(master),
    )
    client.post(
        "/api/auth/accept-invite",
        json={
            "email": "flag@flag.dev",
            "token": r.json()["invite_token"],
            "password": "TempPass!123",
        },
    )

    # Simulate the post-invite state where a temporary password is in force.
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == "flag@flag.dev").one()
        user.must_change_password = True
        db.add(user)
        db.commit()

    login = client.post(
        "/api/auth/login", json={"email": "flag@flag.dev", "password": "TempPass!123"}
    )
    assert login.status_code == 200, login.text
    assert login.json()["user"]["must_change_password"] is True
