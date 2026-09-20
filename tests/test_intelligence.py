"""Phase 3 — Intelligence: pools, AI matching, rediscovery, Copilot."""
from __future__ import annotations

from tests.conftest import auth_headers
from tests.helpers import assign_plan, make_company, make_job, upload_candidate


def _setup(client, master, name, email, plan=None):
    org, tok = make_company(client, master, name, email)
    if plan:
        assign_plan(client, master, org["id"], plan)
    return org, tok


def test_talent_pool_lifecycle_and_isolation(client, master):
    _org_a, tok_a = _setup(client, master, "Pool A", "poola@test.com")
    _org_b, tok_b = _setup(client, master, "Pool B", "poolb@test.com")

    cand = upload_candidate(client, tok_a, "Nina Pool\nnina@pa.com\nPython Docker")

    pool = client.post(
        "/api/pools", json={"name": "Backend Bench", "description": "future roles"},
        headers=auth_headers(tok_a),
    )
    assert pool.status_code == 201, pool.text
    pool_id = pool.json()["id"]

    added = client.post(
        f"/api/pools/{pool_id}/members", json={"candidate_ids": [cand["id"]]},
        headers=auth_headers(tok_a),
    )
    assert added.status_code == 200
    assert added.json()["added"] == 1

    detail = client.get(f"/api/pools/{pool_id}", headers=auth_headers(tok_a)).json()
    assert detail["member_count"] == 1
    assert detail["candidates"][0]["id"] == cand["id"]

    # Tenant B cannot see tenant A's pool.
    assert client.get(f"/api/pools/{pool_id}", headers=auth_headers(tok_b)).status_code == 404

    removed = client.delete(
        f"/api/pools/{pool_id}/members/{cand['id']}", headers=auth_headers(tok_a)
    )
    assert removed.status_code == 204
    assert client.get(f"/api/pools/{pool_id}", headers=auth_headers(tok_a)).json()["member_count"] == 0


def test_matching_ranks_best_candidate(client, master):
    _org, tok = _setup(client, master, "Match Co", "match@test.com")
    strong = upload_candidate(client, tok, "Strong Dev\nstrong@m.com\nPython React Docker Kubernetes 6 years")
    upload_candidate(client, tok, "Weak Dev\nweak@m.com\nC++ Embedded Linux")

    job = make_job(client, tok, "Python Backend Engineer", ["python", "docker", "kubernetes"])

    r = client.post("/api/match", json={"job_id": job["id"]}, headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] >= 1
    top = body["results"][0]
    assert top["id"] == strong["id"]
    assert top["match_score"] > 50
    assert "match_band" in top and "matched_skills" in top
    assert body["results"] == sorted(body["results"], key=lambda c: c["match_score"], reverse=True)


def test_rediscovery_lists_jobs_for_candidate(client, master):
    _org, tok = _setup(client, master, "Redis2 Co", "redis2@test.com")
    cand = upload_candidate(client, tok, "Rae Dev\nrae@r2.com\nPython FastAPI PostgreSQL")
    make_job(client, tok, "Python API Engineer", ["python", "fastapi"])

    r = client.get(f"/api/candidates/{cand['id']}/matches", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 1
    assert r.json()["results"][0]["job_title"] == "Python API Engineer"


def test_copilot_requires_feature_then_answers(client, master):
    org, tok = _setup(client, master, "Copilot Co", "copilot@test.com")
    upload_candidate(client, tok, "Cora Py\ncora@cp.com\nPython AWS Docker 7 years", name="Cora Py")

    # Starter plan does not include copilot.
    blocked = client.post("/api/copilot", json={"query": "python engineers"}, headers=auth_headers(tok))
    assert blocked.status_code == 402, blocked.text

    assign_plan(client, master, org["id"], "growth")
    r = client.post(
        "/api/copilot", json={"query": "find python candidates with 5 years in Boston"},
        headers=auth_headers(tok),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["criteria"]["skills"] == ["python"]
    assert body["criteria"]["min_experience"] == 5
    assert body["count"] >= 0
    assert isinstance(body["message"], str)


def test_saved_searches(client, master):
    _org, tok = _setup(client, master, "Saved Co", "saved@test.com")
    r = client.post(
        "/api/saved-searches", json={"name": "Pythons", "criteria": {"skills": ["python"]}},
        headers=auth_headers(tok),
    )
    assert r.status_code == 201
    rows = client.get("/api/saved-searches", headers=auth_headers(tok)).json()
    assert rows[0]["name"] == "Pythons"
    assert client.delete(
        f"/api/saved-searches/{r.json()['id']}", headers=auth_headers(tok)
    ).status_code == 204
