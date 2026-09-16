from backend.classifier import analyze_resume, is_candidate_resume


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


def test_is_candidate_resume_rejects_invoices_and_receipts() -> None:
    invoice_text = """
    TAX INVOICE
    Invoice No: INV-2024-8891
    Bill To: Global Corp Ltd
    Amount Due: $4,500.00
    Subtotal: $4,000.00
    Total Payable: $4,500.00
    Bank Details: IFSC: HDFC0001234
    """
    valid, reason = is_candidate_resume(invoice_text, "tax_invoice.pdf")
    assert valid is False
    assert "invoice" in reason.lower()

    valid2, reason2 = is_candidate_resume(invoice_text, "attachment_123.pdf")
    assert valid2 is False
    assert "invoice" in reason2.lower()


def test_is_candidate_resume_accepts_valid_resumes() -> None:
    resume_text = """
    Aarav Nair
    aarav@example.com | +91 98765 43210 | Bengaluru
    Experience:
    Senior Software Engineer at Tech Corp (2020 - Present)
    Skills: Python, FastAPI, React, Docker
    Education: B.Tech in Computer Science
    """
    valid, reason = is_candidate_resume(resume_text, "aarav_nair_resume.pdf")
    assert valid is True


def test_is_candidate_resume_rejects_tickets_newsletters_and_flyers() -> None:
    ticket_text = """
    BOARDING PASS / E-TICKET
    Passenger Name: John Smith
    Flight Number: AI 202
    Gate / Seat: 12A
    Baggage Allowance: 25kg
    """
    valid, reason = is_candidate_resume(ticket_text, "flight_ticket.pdf")
    assert valid is False

    newsletter_text = """
    Weekly Tech Digest!
    Here are the top stories this week in technology.
    To stop receiving these emails, unsubscribe or update your email preferences.
    View in browser.
    """
    valid2, reason2 = is_candidate_resume(newsletter_text, "newsletter_may.pdf")
    assert valid2 is False

    flyer_text = """
    Grand Summer Clearance Sale!
    Visit our flagship store this weekend for 50% discounts on all accessories.
    Contact us at support@retailcorp.com or call +1-800-555-0199.
    """
    valid3, reason3 = is_candidate_resume(flyer_text, "flyer_promo.pdf")
    assert valid3 is False


