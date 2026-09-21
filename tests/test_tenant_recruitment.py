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


def upload_candidate(client, token, resume_text=None, **over):
    data = {}
    if resume_text is None:
        resume_text = over.pop("resume_text", None)
        data = {"name": over.pop("name", "Jane Doe"), **over}
        r = client.post(
            "/api/org/candidates", data=data, headers=auth_headers(token)
        )
    else:
        data = {**over}
        files = {"resume": ("jane.pdf", resume_text.encode(), "application/pdf")}
        r = client.post(
            "/api/org/candidates", data=data, files=files, headers=auth_headers(token)
        )
    return r


def test_cross_tenant_visibility_is_blocked(client, master):
    org_a, tok_a = make_company(client, master, "Tenant A", "a@test.com")
    org_b, tok_b = make_company(client, master, "Tenant B", "b@test.com")

    r = upload_candidate(
        client, tok_a, resume_text="Jane Doe\njane@a.com\nPython Django React 3 years experience"
    )
    assert r.status_code == 200, r.text
    cand_a = r.json()

    # Tenant B cannot see tenant A's candidate by id.
    assert client.get(f"/api/org/candidates/{cand_a['id']}", headers=auth_headers(tok_b)).status_code == 404

    # Tenant B creation also does not leak.
    r2 = upload_candidate(client, tok_b, resume_text="Bob Smith\nbob@b.com\nJava Kubernetes")
    assert r2.status_code == 200
    assert r2.json()["organization_id"] == org_b["id"]

    list_a = client.get("/api/org/candidates", headers=auth_headers(tok_a)).json()
    assert all(c["organization_id"] == org_a["id"] for c in list_a)
    assert len(list_a) == 1

    # Jobs are isolated too.
    j = client.post(
        "/api/org/jobs",
        json={"title": "Backend Engineer", "skills": ["python"]},
        headers=auth_headers(tok_a),
    )
    assert j.status_code == 200
    assert client.get(f"/api/org/jobs/{j.json()['id']}", headers=auth_headers(tok_b)).status_code == 404


def test_all_company_scoped_endpoints_require_org(client, master):
    org, tok = make_company(client, master, "Scope Co", "scope@test.com")
    # Access with master (no org scope) yields 403 on company endpoints.
    endpoints = ["/api/org/candidates", "/api/org/jobs", "/api/org/users", "/api/org/seats"]
    for ep in endpoints:
        assert client.get(ep, headers=auth_headers(master)).status_code == 403, ep


def test_seat_limit_is_enforced_server_side(client, master):
    org, tok = make_company(client, master, "Small Co", "small@test.com", seats=3)
    # owner uses 1 seat. Invite two more.
    u1 = client.post(
        "/api/org/users",
        json={"email": "r1@small.com", "name": "Recruiter One", "role": "RECRUITER"},
        headers=auth_headers(tok),
    )
    assert u1.status_code == 200
    u2 = client.post(
        "/api/org/users",
        json={"email": "r2@small.com", "name": "Recruiter Two", "role": "RECRUITER"},
        headers=auth_headers(tok),
    )
    assert u2.status_code == 200

    # Now all seats are taken (owner + 2).
    over = client.post(
        "/api/org/users",
        json={"email": "r3@small.com", "name": "Recruiter Three", "role": "RECRUITER"},
        headers=auth_headers(tok),
    )
    assert over.status_code == 402

    # Deactivating a user frees a seat, allowing a new invite.
    target_id = u2.json()["user"]["id"]
    assert client.patch(
        f"/api/org/users/{target_id}",
        json={"status": "INACTIVE"},
        headers=auth_headers(tok),
    ).status_code == 200
    again = client.post(
        "/api/org/users",
        json={"email": "r3@small.com", "name": "Recruiter Three", "role": "RECRUITER"},
        headers=auth_headers(tok),
    )
    assert again.status_code == 200


def test_permission_based_rbac(client, master):
    org, admin_tok = make_company(client, master, "RBAC Co", "rbac@test.com", seats=10)
    # Create a recruiter and a read-only user.
    rec = client.post(
        "/api/org/users",
        json={"email": "rec@rbac.com", "name": "R", "role": "RECRUITER"},
        headers=auth_headers(admin_tok),
    ).json()
    ro = client.post(
        "/api/org/users",
        json={"email": "ro@rbac.com", "name": "RO", "role": "READ_ONLY"},
        headers=auth_headers(admin_tok),
    ).json()

    rec_tok = client.post(
        "/api/auth/accept-invite",
        json={
            "email": "rec@rbac.com",
            "token": rec["invite_token"],
            "password": "Passw0rd!123",
        },
    ).json()["access_token"]
    ro_tok = client.post(
        "/api/auth/accept-invite",
        json={
            "email": "ro@rbac.com",
            "token": ro["invite_token"],
            "password": "Passw0rd!123",
        },
    ).json()["access_token"]

    # Recruiter can create candidates and jobs.
    cand = upload_candidate(
        client, rec_tok, resume_text="Sam Recruiter\nsam@r.com\nPython 5 years"
    )
    assert cand.status_code == 200
    cand_id = cand.json()["id"]

    # Recruiter can delete a candidate (CANDIDATE_DELETE).
    assert client.delete(f"/api/org/candidates/{cand_id}", headers=auth_headers(rec_tok)).status_code == 200

    # Recruiter is not a user manager.
    assert client.get("/api/org/users", headers=auth_headers(rec_tok)).status_code == 403
    assert client.post(
        "/api/org/users",
        json={"email": "x@rbac.com", "name": "X", "role": "RECRUITER"},
        headers=auth_headers(rec_tok),
    ).status_code in (403,)

    # Read-only can read but not create or delete.
    assert client.get("/api/org/candidates", headers=auth_headers(ro_tok)).status_code == 200
    assert client.post("/api/org/jobs", json={"title": "X"}, headers=auth_headers(ro_tok)).status_code == 403
    assert upload_candidate(client, ro_tok, name="No").status_code == 403
    assert client.delete(f"/api/org/candidates/9999", headers=auth_headers(ro_tok)).status_code == 403


def test_pipeline_stage_and_search(client, master):
    org, tok = make_company(client, master, "Hire Co", "hire@test.com")
    upload_candidate(client, tok, resume_text="Alice Wang\nalice@h.com\nPython Django PostgreSQL")
    upload_candidate(client, tok, resume_text="Bob Kumar\nbob@h.com\nJava Spring AWS")

    stages = client.get("/api/org/pipeline", headers=auth_headers(tok)).json()
    assert stages["counts"].get("NEW") == 2

    # move one to SHORTLISTED
    cands = client.get("/api/org/candidates", headers=auth_headers(tok)).json()
    alice = next(c for c in cands if "Alice" in c["name"])
    moved = client.patch(
        f"/api/org/candidates/{alice['id']}/stage",
        json={"stage": "SHORTLISTED"},
        headers=auth_headers(tok),
    )
    assert moved.json()["stage"] == "SHORTLISTED"

    stages2 = client.get("/api/org/pipeline", headers=auth_headers(tok)).json()
    assert stages2["counts"]["SHORTLISTED"] == 1

    # search by skill / name
    r = client.get("/api/org/candidates", params={"q": "django"}, headers=auth_headers(tok))
    assert len(r.json()) == 1
    assert "Alice" in r.json()[0]["name"]


def test_resume_parsing_and_duplicate_detection(client, master):
    org, tok = make_company(client, master, "Parse Co", "parse@test.com")
    r = upload_candidate(
        client, tok,
        resume_text="Carla Diaz\ncarla@parse.com\n+1 (555) 123 4567\n"
                    "Software Engineer with Python, React and Kubernetes. "
                    "2020 - present at Acme. 6 years of experience.",
    )
    assert r.status_code == 200, r.text
    cand = r.json()
    assert cand["skills"] and ("python" in cand["skills"]) and ("kubernetes" in cand["skills"])
    assert cand["experience_years"] >= 5
    assert cand["email"] == "carla@parse.com"
    assert cand["has_resume"] is True

    # duplicate detected on re-upload with same email
    r2 = upload_candidate(
        client, tok,
        resume_text="Carla D.\ncarla@parse.com\nPython engineer.",
    )
    assert r2.status_code == 200
    assert r2.json()["duplicate_of_id"] == cand["id"]


def test_tags_and_notes(client, master):
    org, tok = make_company(client, master, "Tag Co", "tag@test.com")
    cand = upload_candidate(client, tok, resume_text="Naomi Field\nnaomi@t.com\nSQL Python").json()
    tag = client.post(
        "/api/org/tags", json={"name": "Urgent", "color": "#ef4444"}, headers=auth_headers(tok)
    ).json()
    assert tag["id"]

    tagged = client.patch(
        f"/api/org/candidates/{cand['id']}/tags",
        json={"add_tag_ids": [tag["id"]]},
        headers=auth_headers(tok),
    )
    assert tagged.json()["tags"][0]["name"] == "Urgent"

    # filtering by tag returns the candidate
    filtered = client.get(
        "/api/org/candidates", params={"tag_id": tag["id"]}, headers=auth_headers(tok)
    ).json()
    assert len(filtered) == 1

    note = client.post(
        f"/api/org/candidates/{cand['id']}/notes",
        json={"body": "Strong fit for the data role"},
        headers=auth_headers(tok),
    )
    assert note.status_code == 200
    notes = client.get(f"/api/org/candidates/{cand['id']}/notes", headers=auth_headers(tok)).json()
    assert notes[0]["body"].startswith("Strong fit")


def test_job_rediscovery_of_existing_candidates(client, master):
    org, tok = make_company(client, master, "Redis Co", "redis@test.com")
    upload_candidate(client, tok, resume_text="Max Tailor\nmax@r.com\nPython React Docker")
    upload_candidate(client, tok, resume_text="Lily Stone\nlily@r.com\nC++ Linux Embedded")

    job = client.post(
        "/api/org/jobs",
        json={"title": "Frontend Engineer", "skills": ["react", "javascript"]},
        headers=auth_headers(tok),
    )
    assert job.status_code == 200
    # Historical candidate already tagged as matching the new job.
    cands = client.get("/api/org/candidates", headers=auth_headers(tok)).json()
    max_c = next(c for c in cands if "Max" in c["name"])
    assert job.json()["id"] in max_c["matched_job_ids"]


def test_audit_log_records_actions(client, master):
    org, tok = make_company(client, master, "Audit Co", "audit@test.com")
    client.get("/api/org/audit", headers=auth_headers(tok))
    audit = client.get("/api/org/audit", headers=auth_headers(tok)).json()
    actions = {a["action"] for a in audit}
    assert "user.invited" in actions
    assert "seat.request_reviewed" in actions or "platform.company_created" in actions or "user.accept_invite" in actions


def test_candidate_single_and_bulk_delete(client, master):
    org, tok = make_company(client, master, "Delete Co", "del@test.com")
    c1 = upload_candidate(client, tok, resume_text="Candidate One\none@del.com\nPython 3 years").json()
    c2 = upload_candidate(client, tok, resume_text="Candidate Two\ntwo@del.com\nReact 4 years").json()
    c3 = upload_candidate(client, tok, resume_text="Candidate Three\nthree@del.com\nGo 2 years").json()

    # Single delete
    res = client.delete(f"/api/org/candidates/{c1['id']}", headers=auth_headers(tok))
    assert res.status_code == 200
    assert res.json()["message"] == "Candidate deleted"

    # Confirm c1 is deleted
    assert client.get(f"/api/org/candidates/{c1['id']}", headers=auth_headers(tok)).status_code == 404

    # Bulk delete c2 and c3
    res_bulk = client.post(
        "/api/org/candidates/bulk-delete",
        json={"candidate_ids": [c2["id"], c3["id"]]},
        headers=auth_headers(tok),
    )
    assert res_bulk.status_code == 200
    assert res_bulk.json()["deleted"] == 2

    # Confirm all deleted
    remaining = client.get("/api/org/candidates", headers=auth_headers(tok)).json()
    assert len(remaining) == 0


def test_resume_content_validation_strictly_rejects_invoices_and_accepts_resumes():
    from backend.resume_service import is_valid_resume_content

    # 1. Genuine resumes must pass
    sumith_resume = """
    Sumith K S
    sumith@gmail.com | +91 9876543210
    Bengaluru, India | https://github.com/sumith

    Professional Summary:
    Passionate Frontend Developer with 3+ years experience building responsive web apps with React and JavaScript.

    Technical Skills:
    React, JavaScript, TypeScript, HTML5, CSS3, Tailwind CSS, Redux, Git

    Work Experience:
    Frontend Developer at Tech Corp (2022 - Present)
    - Developed customer facing web applications.
    - Improved page load speed and accessibility.

    Education:
    Bachelor of Engineering in Computer Science (2018 - 2022)
    """
    valid, reason = is_valid_resume_content(sumith_resume, "sumith k s (1).pdf")
    assert valid is True, f"Sumith's resume should be valid: {reason}"

    karthik_resume = """
    Karthik S Kashyap
    karthik@example.com
    Skills: Python, Django, FastAPI, Docker, PostgreSQL
    Experience: 4 years as Backend Engineer
    Projects: Microservices architecture for fintech
    Education: B.Tech in Information Science
    """
    valid, reason = is_valid_resume_content(karthik_resume, "KARTHIK_S_KASHYAP.pdf")
    assert valid is True, f"Karthik's resume should be valid: {reason}"

    # 2. Invoices, bills, receipts, bank statements must be strictly rejected
    invoice_doc = """
    TAX INVOICE
    Invoice No: INV-2024-0988
    Date: 12-Sep-2024
    Bill To: ABC Technologies Pvt Ltd
    GSTIN: 29AABCU9603R1ZM
    Description: Software development & design services
    Qty: 1 | Unit Price: 45000.00
    Sub Total: 45000.00
    CGST 9%: 4050.00
    SGST 9%: 4050.00
    Grand Total: 53100.00
    Mode of Payment: NEFT / Bank Transfer
    """
    valid, reason = is_valid_resume_content(invoice_doc, "Invoice_0988.pdf")
    assert valid is False, "Invoice must be rejected"

    amazon_order = """
    Order Confirmation - Order # 402-1234567-8901234
    Sold by: Cloudtail India Pvt Ltd
    Shipping Address: Sumith, 12th Cross, Bengaluru
    Items Ordered: Wireless Mouse, USB Cable
    Total Amount: INR 1,299.00
    Payment Method: UPI
    """
    valid, reason = is_valid_resume_content(amazon_order, "Order_Details.pdf")
    assert valid is False, "Amazon order must be rejected"

    bank_stmt = """
    Statement of Account
    Account Number: 50100234567890
    Account Summary
    Opening Balance: INR 54,200.00
    Total Deposits: INR 85,000.00
    Total Withdrawals: INR 62,300.00
    Closing Balance: INR 76,900.00
    Statement Period: 01-Aug-2024 to 31-Aug-2024
    """
    valid, reason = is_valid_resume_content(bank_stmt, "statement_aug.pdf")
    assert valid is False, "Bank statement must be rejected"

    ticket_doc = """
    Electronic Reservation Slip (e-Ticket)
    PNR: 4251678901
    Train No & Name: 12628 / Karnataka Express
    Passenger Name: John Doe | Seat Number: B2 34
    Total Fare: Rs. 1450.00
    """
    valid, reason = is_valid_resume_content(ticket_doc, "Ticket.pdf")
    assert valid is False, "Train ticket must be rejected"

    elec_bill = """
    BESCOM Electricity Bill
    Consumer Number: 0987654321
    Meter Number: MTR9988
    Units Consumed: 245 kWh
    Total Amount Due: Rs. 2,150.00
    Due Date: 25-Sep-2024
    """
    valid, reason = is_valid_resume_content(elec_bill, "ElectricityBill.pdf")
    assert valid is False, "Electricity bill must be rejected"