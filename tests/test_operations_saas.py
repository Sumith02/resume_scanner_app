"""Phase 4 (operations) and Phase 5 (SaaS) tests."""
from __future__ import annotations

from pathlib import Path

from tests.conftest import auth_headers
from tests.helpers import assign_plan, make_company, make_job, upload_candidate


def _setup(client, master, name, email, plan=None):
    org, tok = make_company(client, master, name, email)
    if plan:
        assign_plan(client, master, org["id"], plan)
    return org, tok


# -- Phase 4: interviews & scorecards ------------------------------------

def test_interview_and_scorecard_flow(client, master):
    _org, tok = _setup(client, master, "Interview Co", "iv@test.com")
    cand = upload_candidate(client, tok, "Ivy Chen\nivy@iv.com\nPython AWS")
    job = make_job(client, tok, "Backend Engineer", ["python"])

    created = client.post(
        "/api/interviews",
        json={"candidate_id": cand["id"], "job_id": job["id"], "title": "Tech Screen",
              "mode": "VIDEO", "duration_minutes": 45},
        headers=auth_headers(tok),
    )
    assert created.status_code == 201, created.text
    interview_id = created.json()["id"]

    # Scheduling advanced the candidate to INTERVIEW.
    detail = client.get(f"/api/org/candidates/{cand['id']}", headers=auth_headers(tok)).json()
    assert detail["stage"] == "INTERVIEW"

    card = client.post(
        f"/api/interviews/{interview_id}/scorecards",
        json={"technical": 5, "communication": 4, "culture_fit": 4, "overall": 4,
              "recommendation": "HIRE"},
        headers=auth_headers(tok),
    )
    assert card.status_code == 201, card.text
    assert card.json()["overall"] == 4

    got = client.get(f"/api/interviews/{interview_id}", headers=auth_headers(tok)).json()
    assert got["status"] == "COMPLETED"
    assert got["scorecard_count"] == 1
    assert got["average_rating"] == 4.0


def test_interview_is_tenant_scoped(client, master):
    org_a, tok_a = _setup(client, master, "IV A", "iva@test.com")
    _org_b, tok_b = _setup(client, master, "IV B", "ivb@test.com")
    cand = upload_candidate(client, tok_a, "Ann A\nann@a.com\nPython")
    iv = client.post("/api/interviews", json={"candidate_id": cand["id"]},
                     headers=auth_headers(tok_a)).json()

    assert client.get(
        f"/api/interviews/{iv['id']}", headers=auth_headers(tok_b)
    ).status_code == 404
    assert all(
        i["organization_id"] == org_a["id"]
        for i in client.get("/api/interviews", headers=auth_headers(tok_a)).json()
    )


# -- Phase 4: offers & onboarding ----------------------------------------

def test_offer_accept_creates_onboarding(client, master):
    _org, tok = _setup(client, master, "Offer Co", "offer@test.com")
    cand = upload_candidate(client, tok, "Oscar Lee\noscar@o.com\nPython")
    job = make_job(client, tok, "Engineer", ["python"])

    offer = client.post(
        "/api/offers",
        json={"candidate_id": cand["id"], "job_id": job["id"], "salary": 120000},
        headers=auth_headers(tok),
    )
    assert offer.status_code == 201, offer.text
    offer_id = offer.json()["id"]

    # Offer creation moved candidate to OFFER stage.
    assert client.get(f"/api/org/candidates/{cand['id']}", headers=auth_headers(tok)).json()["stage"] == "OFFER"

    accepted = client.post(
        f"/api/offers/{offer_id}/status", json={"status": "ACCEPTED"},
        headers=auth_headers(tok),
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "ACCEPTED"

    assert client.get(f"/api/org/candidates/{cand['id']}", headers=auth_headers(tok)).json()["stage"] == "PLACED"

    tasks = client.get(
        "/api/onboarding", params={"candidate_id": cand["id"]}, headers=auth_headers(tok)
    ).json()
    assert len(tasks) >= 5
    done = client.patch(
        f"/api/onboarding/{tasks[0]['id']}", json={"status": "DONE"}, headers=auth_headers(tok)
    )
    assert done.json()["status"] == "DONE"
    assert done.json()["completed_at"] is not None


# -- Phase 4: email -------------------------------------------------------

def test_email_template_and_mock_send(client, master):
    _org, tok = _setup(client, master, "Email Co", "email@test.com")
    cand = upload_candidate(client, tok, "Eve Stone\neve@e.com\nPython")

    tpl = client.post(
        "/api/email/templates",
        json={"name": "Interview Invite", "subject": "Interview with us",
              "body": "Hi {{name}}, let's schedule."},
        headers=auth_headers(tok),
    )
    assert tpl.status_code == 201, tpl.text

    sent = client.post(
        "/api/email/send",
        json={"candidate_id": cand["id"], "subject": "Next steps", "body": "Hello!",
              "template_id": tpl.json()["id"]},
        headers=auth_headers(tok),
    )
    assert sent.status_code == 201, sent.text
    assert sent.json()["status"] == "SENT"
    assert sent.json()["provider"] == "MOCK"
    assert sent.json()["to_email"] == "eve@e.com"

    messages = client.get("/api/email/messages", headers=auth_headers(tok)).json()
    assert len(messages) == 1


def test_gmail_sync_requires_plan_and_ingests_demo(client, master):
    org, tok = _setup(client, master, "Gmail Co", "gmail@test.com")

    # Starter plan lacks gmail_sync.
    blocked = client.get("/api/email/gmail/connect", headers=auth_headers(tok))
    assert blocked.status_code == 402, blocked.text

    assign_plan(client, master, org["id"], "growth")

    conn = client.post("/api/email/gmail/connect-demo", headers=auth_headers(tok))
    assert conn.status_code == 201, conn.text
    assert conn.json()["account"]["is_demo"] is True

    from backend.config import DEMO_INBOX_DIR

    inbox = Path(DEMO_INBOX_DIR)
    inbox.mkdir(parents=True, exist_ok=True)
    (inbox / "gmail_resume_pdf.pdf").write_bytes(
        b"Priya Gmail\npriya@gmail.com\nPython Django AWS 8 years experience"
    )
    (inbox / "company_logo.png").write_bytes(b"not a resume")

    sync = client.post("/api/email/gmail/sync", headers=auth_headers(tok))
    assert sync.status_code == 200, sync.text
    assert sync.json()["summary"]["ingested"] == 1

    cands = client.get("/api/org/candidates", headers=auth_headers(tok)).json()
    assert any("Priya" in c["name"] for c in cands)
    gmail_cand = next(c for c in cands if "Priya" in c["name"])
    assert gmail_cand["source"] == "GMAIL"
    assert "python" in gmail_cand["skills"]

    # Idempotent: a second sync does not re-ingest the same file.
    sync2 = client.post("/api/email/gmail/sync", headers=auth_headers(tok))
    assert sync2.json()["summary"]["ingested"] == 0


def test_gmail_only_connects_registered_mailbox(client, master):
    from backend.db import SessionLocal
    from backend.models import EmailAccount

    org, tok = _setup(client, master, "Guard Co", "guard@test.com")
    assign_plan(client, master, org["id"], "growth")

    conn = client.post("/api/email/gmail/connect-demo", headers=auth_headers(tok))
    assert conn.status_code == 201, conn.text
    assert conn.json()["account"]["email"] == "guard@test.com"

    # A mailbox that is not a registered user of the tenant cannot be synced.
    with SessionLocal() as db:
        account = db.query(EmailAccount).first()
        account.email = "stranger@gmail.com"
        db.add(account)
        db.commit()

    blocked = client.post("/api/email/gmail/sync", headers=auth_headers(tok))
    assert blocked.status_code == 403, blocked.text


# -- Phase 5: billing, usage, plans --------------------------------------

def test_subscription_usage_and_invoice(client, master):
    _org, tok = _setup(client, master, "Bill Co", "bill@test.com")

    plans = client.get("/api/billing/plans", headers=auth_headers(tok)).json()
    assert {p["code"] for p in plans} == {"starter", "growth", "enterprise"}

    sub = client.post("/api/billing/subscribe", json={"plan_code": "growth"},
                      headers=auth_headers(tok))
    assert sub.status_code == 200, sub.text
    assert sub.json()["plan"]["code"] == "growth"

    usage = client.get("/api/billing/usage", headers=auth_headers(tok)).json()
    assert usage["plan"]["code"] == "growth"
    assert usage["features"]["gmail_sync"] is True
    assert usage["metrics"]["ai_matches"]["limit"] == 5000

    invoices = client.get("/api/billing/invoices", headers=auth_headers(tok)).json()
    assert len(invoices) == 1
    assert invoices[0]["amount_cents"] == 14900
    paid = client.post(f"/api/billing/invoices/{invoices[0]['id']}/pay",
                       headers=auth_headers(tok))
    assert paid.json()["status"] == "PAID"


def test_ai_match_usage_is_metered(client, master):
    _org, tok = _setup(client, master, "Meter Co", "meter@test.com")
    upload_candidate(client, tok, "Met Dev\nmet@m.com\nPython")
    job = make_job(client, tok, "Py Eng", ["python"])

    for _ in range(3):
        client.post("/api/match", json={"job_id": job["id"]}, headers=auth_headers(tok))

    usage = client.get("/api/billing/usage", headers=auth_headers(tok)).json()
    assert usage["metrics"]["ai_matches"]["used"] == 3
    assert usage["metrics"]["resume_parses"]["used"] == 1


# -- Phase 5: client portal ----------------------------------------------

def test_client_portal_shares_narrow_view(client, master):
    _org, tok = _setup(client, master, "Portal Co", "portal@test.com", plan="growth")
    cand = upload_candidate(
        client, tok, "Pia Portal\npia@pp.com\n+1 555 000 1111\nPython Docker 4 years"
    )
    job = make_job(client, tok, "Python Engineer", ["python"])

    token_resp = client.post(
        "/api/portal/tokens",
        json={"client_name": "Acme Client", "job_ids": [job["id"]]},
        headers=auth_headers(tok),
    )
    assert token_resp.status_code == 201, token_resp.text
    secret = token_resp.json()["token"]

    view = client.get(f"/api/portal/{secret}")
    assert view.status_code == 200, view.text
    assert view.json()["client_name"] == "Acme Client"
    assert view.json()["jobs"][0]["id"] == job["id"]

    cands = client.get(f"/api/portal/{secret}/jobs/{job['id']}/candidates")
    assert cands.status_code == 200
    assert cands.json()["count"] == 1
    public = cands.json()["candidates"][0]
    # Sensitive fields must not leak to external clients.
    assert "email" not in public and "phone" not in public and "resume_path" not in public
    assert public["name"] == cand["name"]

    # Revoking the token kills access.
    client.delete(f"/api/portal/tokens/{token_resp.json()['id']}", headers=auth_headers(tok))
    assert client.get(f"/api/portal/{secret}").status_code == 404


def test_client_portal_is_plan_gated(client, master):
    _org, tok = _setup(client, master, "No Portal", "noportal@test.com")
    r = client.post("/api/portal/tokens", json={"client_name": "X"}, headers=auth_headers(tok))
    assert r.status_code == 402


# -- Phase 5: analytics ---------------------------------------------------

def test_tenant_analytics(client, master):
    _org, tok = _setup(client, master, "Analytics Co", "analytics@test.com")
    cand = upload_candidate(client, tok, "Ana Lytics\nana@an.com\nPython SQL")
    make_job(client, tok, "Data Engineer", ["python", "sql"])
    client.patch(f"/api/org/candidates/{cand['id']}/stage", json={"stage": "SHORTLISTED"},
                 headers=auth_headers(tok))

    r = client.get("/api/analytics/overview", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["totals"]["candidates"] == 1
    assert body["totals"]["jobs"] == 1
    assert any(f["stage"] == "SHORTLISTED" and f["count"] == 1 for f in body["funnel"])
    assert body["top_skills"]


def test_platform_analytics_master_only(client, master):
    _org, tok = _setup(client, master, "Plat Co", "plat@test.com")
    assert client.get("/api/analytics/platform", headers=auth_headers(tok)).status_code == 403
    r = client.get("/api/analytics/platform", headers=auth_headers(master))
    assert r.status_code == 200, r.text
    assert r.json()["organizations"]["total"] >= 1


def test_is_probably_bad_attachment_filters_non_resumes():
    from backend.ingestion import is_probably_bad_attachment

    # Bank statements and financial/admin docs must be filtered out
    assert is_probably_bad_attachment("61568XXXX_DownloadStatement_1787905475.pdf") is True
    assert is_probably_bad_attachment("Bank_Statement_Jan_2026.pdf") is True
    assert is_probably_bad_attachment("Salary_Slip_August.pdf") is True
    assert is_probably_bad_attachment("Invoice_9921.pdf") is True
    assert is_probably_bad_attachment("Tax_Return_Form_1099.pdf") is True
    assert is_probably_bad_attachment("Aadhaar_Card.pdf") is True

    # Real resumes must NOT be filtered out
    assert is_probably_bad_attachment("John_Doe_Resume.pdf") is False
    assert is_probably_bad_attachment("Senior_Engineer_CV.docx") is False
    assert is_probably_bad_attachment("Jane_Smith.pdf") is False


def test_resume_text_and_ingestion_sanitizes_nul_bytes(client, master):
    from backend.db import SessionLocal
    from backend.ingestion import ingest_resume
    from backend.models import Candidate, Organization
    from backend.resume_service import extract_resume_text

    # Binary data containing NUL bytes should never produce NUL bytes in extracted text
    raw_corrupted_data = b"%PDF-1.4\x00\x00\x01\x02\x00RandomBinaryData\x00\x00"
    extracted = extract_resume_text("bad.pdf", raw_corrupted_data)
    assert "\x00" not in extracted

    # Test candidate ingestion strips any \x00 bytes before inserting into DB
    org_dict, _tok = _setup(client, master, "Nul Co", "nul@test.com")
    with SessionLocal() as db:
        org = db.query(Organization).filter(Organization.id == org_dict["id"]).first()
        result = ingest_resume(
            db,
            org=org,
            filename="test_nul.txt",
            data="Alice\x00 Null\nemail\x00@test.com\nPython\x00 Developer".encode(),
            overrides={
                "name": "Alice\x00 With Null",
                "summary": "Summary\x00 with null byte",
            },
            meter=False,
        )
        cand_id = result["candidate"].id
        cand = db.query(Candidate).filter(Candidate.id == cand_id).first()
        assert "\x00" not in cand.name
        assert "\x00" not in (cand.summary or "")
        assert "\x00" not in (cand.resume_text or "")
        for skill in cand.skills:
            assert "\x00" not in skill

