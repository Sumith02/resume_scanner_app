"""Shared test helpers."""
from __future__ import annotations

from tests.conftest import auth_headers


def make_company(client, master, name, email, seats=10):
    r = client.post(
        "/api/master/companies",
        json={"name": name, "email": email, "seat_limit": seats},
        headers=auth_headers(master),
    )
    assert r.status_code == 200, r.text
    b = r.json()
    ac = client.post(
        "/api/auth/accept-invite",
        json={"email": email, "token": b["invite_token"], "password": "Passw0rd!123"},
    )
    assert ac.status_code == 200, ac.text
    return b["company"], ac.json()["access_token"]


def assign_plan(client, master, org_id, plan_code, **extra):
    r = client.post(
        f"/api/billing/organizations/{org_id}/plan",
        json={"plan_code": plan_code, **extra},
        headers=auth_headers(master),
    )
    assert r.status_code == 200, r.text
    return r.json()


def upload_candidate(client, token, text, name=None, filename="resume.pdf"):
    data = {"name": name} if name else {}
    files = {"resume": (filename, text.encode(), "application/pdf")}
    r = client.post("/api/org/candidates", data=data, files=files,
                    headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return r.json()


def make_job(client, token, title, skills):
    r = client.post("/api/org/jobs", json={"title": title, "skills": skills},
                    headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return r.json()
