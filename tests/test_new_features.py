from tests.conftest import auth_headers
from tests.test_tenant_recruitment import make_company
from backend.resume_service import extract_location, extract_summary


def test_extract_location_unit():
    # Labeled location
    assert extract_location("Alice Smith\nalice@test.com\nLocation: Bengaluru, India\nSkills: Python, Django") == "Bengaluru, India"
    # Tech hub detection
    assert "San Francisco" in (extract_location("John Doe\njohn@sf.com\nSan Francisco, CA | Full Stack Engineer\nExperience: 5 years") or "")
    # Remote
    assert extract_location("Developer\nRemote | Available Worldwide\nSkills: React, TypeScript") == "Remote"


def test_extract_summary_unit():
    # Explicit summary section
    text = """Alice Smith
alice@example.com
PROFESSIONAL SUMMARY
Senior Frontend Developer with over 6 years of experience building scalable, high-performance web applications using React and TypeScript.
WORK EXPERIENCE
Software Engineer at TechCorp 2020-Present"""
    summary = extract_summary(text)
    assert summary is not None
    assert "Senior Frontend Developer with over 6 years of experience" in summary
    assert "WORK EXPERIENCE" not in summary

    # Synthesized summary when no explicit section exists
    text_nosummary = """Bob Builder
bob@example.com
Python, React, Docker, Kubernetes
2019 - Present Software Engineer"""
    synth = extract_summary(text_nosummary, title="Full Stack Engineer", exp_years=4, skills=["python", "react", "docker"])
    assert synth is not None
    assert "Full Stack Engineer" in synth
    assert "4+ years of experience" in synth
    assert "Python" in synth


def test_bulk_resume_upload_and_location_search(client, master):
    org, tok = make_company(client, master, "TechCorp", "admin@techcorp.com")

    # 1. Test Bulk Upload of multiple resumes simultaneously
    resume1 = (
        "Alice Walker\nalice@techcorp.com\nLocation: Bengaluru, India\n"
        "Frontend Developer with 5 years experience\nTechnical Skills: React, TypeScript, HTML, CSS\nExperience: 2019 - Present"
    )
    resume2 = (
        "Bob Miller\nbob@techcorp.com\nLocation: London, UK\n"
        "Backend Python Engineer with 4 years experience\nTechnical Skills: Python, FastAPI, PostgreSQL, Docker\nExperience: 2020 - Present"
    )
    resume3 = (
        "Charlie Davis\ncharlie@techcorp.com\nLocation: Bengaluru, India\n"
        "Fullstack Engineer\nTechnical Skills: React, Node.js, Python\nExperience: 2021 - Present"
    )

    files = [
        ("resumes", ("alice.pdf", resume1.encode(), "application/pdf")),
        ("resumes", ("bob.pdf", resume2.encode(), "application/pdf")),
        ("resumes", ("charlie.pdf", resume3.encode(), "application/pdf")),
    ]

    r_bulk = client.post(
        "/api/org/candidates/bulk-upload",
        files=files,
        data={"stage": "NEW"},
        headers=auth_headers(tok),
    )
    assert r_bulk.status_code == 200, r_bulk.text
    bulk_res = r_bulk.json()
    assert bulk_res["total"] == 3
    assert bulk_res["succeeded"] == 3
    assert bulk_res["failed"] == 0
    assert len(bulk_res["candidates"]) == 3

    # Check extracted location and summaries
    cand_map = {c["name"]: c for c in bulk_res["candidates"]}
    assert "Alice Walker" in cand_map
    assert cand_map["Alice Walker"]["location"] == "Bengaluru, India"
    assert cand_map["Alice Walker"]["summary"] is not None
    assert len(cand_map["Alice Walker"]["summary"]) > 20

    assert "Bob Miller" in cand_map
    assert "London" in (cand_map["Bob Miller"]["location"] or "")

    # 2. Location-wise search
    r_loc_blr = client.get("/api/org/candidates?location=Bengaluru", headers=auth_headers(tok))
    assert r_loc_blr.status_code == 200
    blr_cands = r_loc_blr.json()
    assert len(blr_cands) == 2
    assert all("Bengaluru" in c["location"] for c in blr_cands)

    r_loc_lon = client.get("/api/org/candidates?location=London", headers=auth_headers(tok))
    assert r_loc_lon.status_code == 200
    lon_cands = r_loc_lon.json()
    assert len(lon_cands) == 1
    assert lon_cands[0]["name"] == "Bob Miller"

    # 3. Skill-wise filtering
    r_skill_react = client.get("/api/org/candidates?skill=React", headers=auth_headers(tok))
    assert r_skill_react.status_code == 200
    react_cands = r_skill_react.json()
    assert len(react_cands) == 2  # Alice and Charlie
    react_names = {c["name"] for c in react_cands}
    assert "Alice Walker" in react_names
    assert "Charlie Davis" in react_names

    r_skill_fastapi = client.get("/api/org/candidates?skill=FastAPI", headers=auth_headers(tok))
    assert r_skill_fastapi.status_code == 200
    fastapi_cands = r_skill_fastapi.json()
    assert len(fastapi_cands) == 1
    assert fastapi_cands[0]["name"] == "Bob Miller"

    # 4. Status/Stage filtering
    r_stage = client.get("/api/org/candidates?stage=NEW", headers=auth_headers(tok))
    assert r_stage.status_code == 200
    assert len(r_stage.json()) == 3

    # 5. Duplicate detection in bulk upload
    files_dup = [
        ("resumes", ("alice_again.pdf", resume1.encode(), "application/pdf")),
    ]
    r_dup = client.post(
        "/api/org/candidates/bulk-upload",
        files=files_dup,
        headers=auth_headers(tok),
    )
    assert r_dup.status_code == 200
    dup_res = r_dup.json()
    assert dup_res["duplicates"] == 1


def test_vacancy_announcement_and_broadcast(client, master):
    org, tok = make_company(client, master, "HiringCorp", "hiring@corp.com")

    # Upload Frontend and Backend candidates
    fe_resume = (
        "Sarah Connor\nsarah@sky.net\nLocation: Austin, TX\n"
        "Lead Frontend Developer\nTechnical Skills: React, TypeScript, HTML, CSS, Tailwind\nExperience: 2018 - Present"
    )
    be_resume = (
        "Marcus Wright\nmarcus@resistance.org\nLocation: Seattle, WA\n"
        "Senior Backend Go Engineer\nTechnical Skills: Go, Golang, Kubernetes, Docker\nExperience: 2017 - Present"
    )
    files = [
        ("resumes", ("sarah.pdf", fe_resume.encode(), "application/pdf")),
        ("resumes", ("marcus.pdf", be_resume.encode(), "application/pdf")),
    ]
    client.post("/api/org/candidates/bulk-upload", files=files, headers=auth_headers(tok))

    # Create Frontend Vacancy / Job
    r_job = client.post(
        "/api/org/jobs",
        json={
            "title": "Senior Frontend Developer",
            "department": "Engineering",
            "location": "Remote",
            "salary_range": "$120k - $150k",
            "requirements": "Strong experience in React, TypeScript, and modern CSS architecture.",
            "skills": ["react", "typescript", "frontend"],
        },
        headers=auth_headers(tok),
    )
    assert r_job.status_code == 200, r_job.text
    job = r_job.json()
    job_id = job["id"]

    # 1. Test Preview: Matching Domain & Skills Only
    r_prev_match = client.get(
        f"/api/email/vacancy-candidates?job_id={job_id}&audience=matching",
        headers=auth_headers(tok),
    )
    assert r_prev_match.status_code == 200
    prev_match = r_prev_match.json()
    assert prev_match["eligible_count"] == 1
    assert prev_match["candidates"][0]["name"] == "Sarah Connor"
    assert any(w in prev_match["candidates"][0]["match_reason"].lower() for w in ["react", "skill", "title", "pipeline"])

    # 2. Test Preview: All Candidates
    r_prev_all = client.get(
        f"/api/email/vacancy-candidates?job_id={job_id}&audience=all",
        headers=auth_headers(tok),
    )
    assert r_prev_all.status_code == 200
    prev_all = r_prev_all.json()
    assert prev_all["eligible_count"] == 2
    all_names = {c["name"] for c in prev_all["candidates"]}
    assert "Sarah Connor" in all_names
    assert "Marcus Wright" in all_names

    # 3. Test Broadcast to Matching Domain Only
    r_broadcast_match = client.post(
        "/api/email/broadcast-vacancy",
        json={
            "job_id": job_id,
            "audience": "matching",
            "subject": "New Opening: {{job_title}} at {{company_name}}",
            "body": "Hi {{candidate_name}}, we want you for {{job_title}} in {{location}}! Pays {{salary_range}}.",
        },
        headers=auth_headers(tok),
    )
    assert r_broadcast_match.status_code == 200, r_broadcast_match.text
    b_match = r_broadcast_match.json()
    assert b_match["status"] == "success"
    assert b_match["sent_count"] == 1
    assert b_match["job_title"] == "Senior Frontend Developer"

    # Verify sent messages in outbox with template variable interpolation
    msgs = client.get("/api/email/messages", headers=auth_headers(tok)).json()
    assert len(msgs) == 1
    assert msgs[0]["to_email"] == "sarah@sky.net"
    assert "Senior Frontend Developer at HiringCorp" in msgs[0]["subject"]
    assert "Hi Sarah Connor" in msgs[0]["body"]
    assert "Senior Frontend Developer in Remote" in msgs[0]["body"]
    assert "$120k - $150k" in msgs[0]["body"]

    # 4. Test Broadcast to All Candidates
    r_broadcast_all = client.post(
        "/api/email/broadcast-vacancy",
        json={
            "job_id": job_id,
            "audience": "all",
            "subject": "Company-wide Announcement: {{job_title}}",
            "body": "Hi {{candidate_name}}, check out this opening: {{job_title}}",
        },
        headers=auth_headers(tok),
    )
    assert r_broadcast_all.status_code == 200, r_broadcast_all.text
    b_all = r_broadcast_all.json()
    assert b_all["sent_count"] == 2

    msgs_after = client.get("/api/email/messages", headers=auth_headers(tok)).json()
    assert len(msgs_after) == 3


def test_extract_location_varieties():
    # 1. Pipe-separated contact line with email, phone, and LinkedIn
    t1 = "Alice Smith\nalice@example.com | +91 9876543210 | Bengaluru, India | linkedin.com/in/alice"
    assert extract_location(t1) == "Bengaluru, India"

    # 2. Bullet separated with US city and state abbreviation
    t2 = "Bob Taylor\nbob@test.org • Austin, TX • (512) 555-1234"
    assert extract_location(t2) == "Austin, TX"

    # 3. Slash separated
    t3 = "Charlie Brown / charlie@peanuts.com / Mumbai, Maharashtra / +91 9988776655"
    assert extract_location(t3) == "Mumbai, Maharashtra"

    # 4. Indian pincode stripped
    t4 = "Deepak Kumar\ndeepak@gmail.com\nHyderabad, Telangana - 500081\nFull Stack Engineer"
    assert extract_location(t4) == "Hyderabad, Telangana"

    # 5. Label with "Current Location:"
    t5 = "John Doe\njohn@example.com\nCurrent Location: Chennai, Tamil Nadu\nSkills: Python"
    assert extract_location(t5) == "Chennai, Tamil Nadu"

    # 6. Tech hubs
    t6 = "Developer Resume\nLocation: Seattle, WA\nExperience: 7 years"
    assert extract_location(t6) == "Seattle, WA"


def test_candidate_location_backfill_and_patch(client, master):
    org, tok = make_company(client, master, "LocCorp", "admin@loccorp.com")

    # Upload candidate without explicit location form field, containing location in contact header line
    resume_content = (
        "Rahul Sharma\n"
        "rahul@loccorp.com | +91 9876543210 | Bengaluru, India | github.com/rahul\n"
        "Frontend Engineer with 4 years experience in React and TypeScript."
    )
    r_create = client.post(
        "/api/org/candidates",
        files={"resume": ("rahul_resume.pdf", resume_content.encode(), "application/pdf")},
        data={"name": "Rahul Sharma"},
        headers=auth_headers(tok),
    )
    assert r_create.status_code == 200, r_create.text
    cand = r_create.json()
    assert cand["location"] == "Bengaluru, India"
    cand_id = cand["id"]

    # Test candidate location lazy backfill: simulate an older record in the database where location was None
    from backend.db import SessionLocal
    from backend.models import Candidate
    db = SessionLocal()
    db_cand = db.get(Candidate, cand_id)
    assert db_cand is not None
    db_cand.location = None
    db.commit()
    db.close()

    # Search candidates: should lazily backfill the location from resume_text
    r_list = client.get("/api/org/candidates", headers=auth_headers(tok))
    assert r_list.status_code == 200
    listed = [c for c in r_list.json() if c["id"] == cand_id]
    assert len(listed) == 1
    assert listed[0]["location"] == "Bengaluru, India"

    # Check synonym search: "Bangalore" should match candidate with "Bengaluru"
    r_syn = client.get("/api/org/candidates?location=bangalore", headers=auth_headers(tok))
    assert r_syn.status_code == 200
    syn_cands = r_syn.json()
    assert len(syn_cands) >= 1
    assert any(c["id"] == cand_id for c in syn_cands)

    # Candidate detail endpoint: returns backfilled location
    r_detail = client.get(f"/api/org/candidates/{cand_id}", headers=auth_headers(tok))
    assert r_detail.status_code == 200
    assert r_detail.json()["location"] == "Bengaluru, India"

    # Patch candidate: manually update location to another city
    r_patch = client.patch(
        f"/api/org/candidates/{cand_id}",
        json={"location": "Pune, Maharashtra"},
        headers=auth_headers(tok),
    )
    assert r_patch.status_code == 200, r_patch.text
    assert r_patch.json()["location"] == "Pune, Maharashtra"

    # Query with updated location
    r_pune = client.get("/api/org/candidates?location=Pune", headers=auth_headers(tok))
    assert r_pune.status_code == 200
    assert any(c["id"] == cand_id for c in r_pune.json())
