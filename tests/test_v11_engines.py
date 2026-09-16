from backend.classifier import analyze_resume
from backend.copilot_engine import process_copilot_message
from backend.match_engine import compute_multidimensional_match
from backend.rediscovery_engine import rediscover_candidates_for_job
from backend.search_engine import execute_hybrid_search, parse_natural_language_query
from backend.talent_engine import extract_candidate_intelligence, normalize_skill


def test_talent_engine_skill_normalization_and_dossier():
    canonical, category = normalize_skill("reactjs")
    assert canonical == "React"
    assert category == "frontend"

    raw_text = """Vikram Patel
vikram@example.com | +91 99887 76655 | Bengaluru
Senior Backend Engineer with 6+ years experience.
Expert in Python, FastAPI, PostgreSQL, AWS, Docker and Redis.
Built high-throughput payment microservices.
B.Tech in Computer Science from National Institute of Technology (2018).
"""
    analysis = analyze_resume(raw_text, "vikram_resume.pdf")
    dossier = extract_candidate_intelligence(raw_text, analysis)

    assert dossier["blindId"].startswith("T-")
    assert "Senior" in dossier["headline"]
    assert dossier["dataQualityScore"] >= 80
    assert len(dossier["skills"]) >= 3
    assert len(dossier["experiences"]) >= 1
    assert len(dossier["educations"]) >= 1


def test_multidimensional_match_engine():
    cand = {
        "id": "cand-1",
        "canonicalName": "Vikram Patel",
        "experienceYears": 6.0,
        "location": "Bengaluru, Karnataka, India",
        "primaryDomainKey": "backend",
        "matchedSkills": ["Python", "FastAPI", "PostgreSQL", "AWS", "Docker"],
        "skills": [
            {"skillName": "Python", "evidenceText": "Architected Python backend services."},
            {"skillName": "AWS", "evidenceText": "Deployed containers to AWS ECS."},
        ],
        "educations": [{"degree": "B.Tech"}],
    }
    job = {
        "title": "Senior Python Backend Engineer",
        "description": "Looking for 5+ years experience in Python, AWS, Docker, and PostgreSQL in Bengaluru.",
        "location": "Bengaluru",
    }
    result = compute_multidimensional_match(cand, job)
    assert result["overallScore"] >= 80
    assert "requiredSkills" in result["scoreBreakdown"]
    assert len(result["evidence"]) >= 1
    assert len(result["interviewQuestions"]) >= 1


def test_talent_rediscovery_engine():
    candidates = [
        {
            "id": "cand-1",
            "canonicalName": "Neha Gupta",
            "experienceYears": 5.0,
            "location": "Bengaluru",
            "primaryDomainKey": "backend",
            "matchedSkills": ["Python", "AWS", "PostgreSQL"],
            "skills": [],
        }
    ]
    job = {
        "title": "Python Developer",
        "description": "We need Python and PostgreSQL engineers.",
        "location": "Bengaluru",
    }
    applications = [{"candidateId": "cand-1", "status": "interview"}]
    rediscovery = rediscover_candidates_for_job(job, candidates, applications, min_score=60)

    assert rediscovery["metrics"]["totalSearched"] == 1
    assert rediscovery["metrics"]["strongMatches"] == 1
    assert "Previously interviewed" in rediscovery["results"][0]["historicalTag"]


def test_natural_language_search_and_copilot():
    parsed = parse_natural_language_query("Find senior Python developers in Bengaluru with 4+ years experience")
    assert "Python" in parsed["parsedCriteria"]["skills"]
    assert parsed["parsedCriteria"]["minExperience"] == 4.0
    assert parsed["parsedCriteria"]["location"] == "Bengaluru"

    candidates = [
        {
            "id": "c-1",
            "canonicalName": "Rahul Sharma",
            "experienceYears": 5.0,
            "location": "Bengaluru",
            "matchedSkills": ["Python", "AWS"],
            "currentTitle": "Senior Backend Developer",
            "profileSummary": "Experienced Python backend engineer.",
        }
    ]
    search_res = execute_hybrid_search("Python Bengaluru", candidates)
    assert search_res["totalFound"] >= 1

    copilot_res = process_copilot_message("Compare candidates", candidates, [])
    assert copilot_res["role"] == "assistant"
    assert len(copilot_res["toolCalls"]) >= 1

    # Test greeting
    copilot_hello = process_copilot_message("Hello", candidates, [])
    assert "Welcome to Nexerra" in copilot_hello["content"]

    # Test empty candidate pool
    copilot_empty = process_copilot_message("Find Python devs", [], [])
    assert "Candidate Database is Empty" in copilot_empty["content"]

    # Test interview guide generation
    copilot_interview = process_copilot_message("Generate interview questions", candidates, [])
    assert "Interview Guide" in copilot_interview["content"]


def test_talent_graph_engine():
    from backend.graph_engine import build_candidate_talent_graph, calculate_candidate_similarity

    c1 = {
        "id": "c-1",
        "canonicalName": "Alice Developer",
        "currentTitle": "Senior React Engineer",
        "matchedSkills": ["React", "TypeScript", "Node.js"],
        "skills": [{"skillName": "React", "normalizedSkill": "React", "proficiency": "Expert"}],
        "experiences": [{"company": "Acme Tech", "title": "Frontend Lead", "startDate": "2021", "endDate": "2024"}],
        "educations": [{"institution": "MIT", "degree": "B.S.", "field": "Computer Science"}],
        "location": "Bengaluru",
        "experienceYears": 6.0,
        "status": "interview",
    }
    c2 = {
        "id": "c-2",
        "canonicalName": "Bob Coder",
        "currentTitle": "React Developer",
        "matchedSkills": ["React", "TypeScript", "Redux"],
        "experiences": [{"company": "Acme Tech", "title": "UI Engineer", "startDate": "2022", "endDate": "2024"}],
        "location": "Bengaluru",
        "experienceYears": 5.0,
    }

    sim_score, reasons = calculate_candidate_similarity(c1, c2)
    assert sim_score >= 50
    assert any("React" in r or "Acme Tech" in r for r in reasons)

    graph = build_candidate_talent_graph(c1, [c1, c2], jobs=[{"id": "j-1", "title": "Senior Frontend", "requiredSkills": ["React"]}])
    assert graph["candidateId"] == "c-1"
    node_types = {n["type"] for n in graph["nodes"]}
    assert "candidate" in node_types
    assert "skill" in node_types
    assert "company" in node_types
    assert "role" in node_types
    assert "education" in node_types
    assert "similar_candidate" in node_types
    assert len(graph["similarCandidates"]) == 1


def test_agency_client_service():
    from backend.client_service import agency_client_service

    clients = agency_client_service.list_clients()
    assert len(clients) >= 3
    client_a = next(c for c in clients if c["code"] == "CLIENT A")
    assert client_a["openJobsCount"] == 14
    assert client_a["candidatePoolCount"] == 8200
    assert client_a["recruiterCount"] == 4

    client_b = next(c for c in clients if c["code"] == "CLIENT B")
    assert client_b["openJobsCount"] == 9
    assert client_b["candidatePoolCount"] == 4700
    assert client_b["recruiterCount"] == 3

    client_c = next(c for c in clients if c["code"] == "CLIENT C")
    assert client_c["openJobsCount"] == 22
    assert client_c["candidatePoolCount"] == 17000
    assert client_c["recruiterCount"] == 7

    overview = agency_client_service.get_agency_overview()
    assert overview["totalOpenJobs"] == 45
    assert overview["totalCandidateIntelligence"] == 29900
    assert overview["totalAgencyRecruiters"] == 14

