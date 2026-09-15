from backend.classifier import analyze_resume


def test_extracts_candidate_fields_and_primary_skill() -> None:
    result = analyze_resume(
        """Aarav Nair
aarav@example.com | +91 98765 43210 | Bengaluru
Backend Engineer with 6+ years of experience.
Python, FastAPI, PostgreSQL, Redis, Docker and REST API.
""",
        "resume.pdf",
    )

    assert result["candidateName"] == "Aarav Nair"
    assert result["email"] == "aarav@example.com"
    assert result["location"] == "Bengaluru, Karnataka, India"
    assert result["primarySkillKey"] == "backend"
    assert result["experienceYears"] == 6


def test_uses_file_name_when_resume_has_no_name_heading() -> None:
    result = analyze_resume("Skills\nFigma and user research", "priya_sharma.docx")
    assert result["candidateName"] == "Priya Sharma"
