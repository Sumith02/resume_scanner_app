from backend.classifier import analyze_resume, classify_email_context, is_candidate_resume


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


def test_is_candidate_resume_rejects_certificates_and_transcripts() -> None:
    cert_text = """
    Certificate of Completion
    This is to certify that Rahul Sharma has successfully completed the course
    Mastering Python & Microservices at Tech Academy on 15-May-2023.
    """
    valid, reason = is_candidate_resume(cert_text, "certificate_python.pdf")
    assert valid is False
    assert "rejected" in reason.lower()

    transcript_text = """
    National Institute of Technology
    Statement of Marks / Academic Transcript
    Semester Examination 2023
    Controller of Examinations
    Cumulative Grade Point Average (CGPA): 8.9 / 10
    """
    valid2, reason2 = is_candidate_resume(transcript_text, "marksheet_sem8.pdf")
    assert valid2 is False
    assert "rejected" in reason2.lower()


def test_is_candidate_resume_rejects_offer_letters_and_payslips() -> None:
    offer_text = """
    Dear Candidate,
    We are pleased to offer you the position of Senior Backend Engineer at Acme Corp.
    Letter of Offer and appointment terms:
    Your gross salary will be $120,000 per annum with a probation period of 3 months.
    """
    valid, reason = is_candidate_resume(offer_text, "offer_letter.pdf")
    assert valid is False
    assert "rejected" in reason.lower()

    payslip_text = """
    Acme Software Services Pvt Ltd
    Payslip for the month of August 2024
    Employee ID: ACME-901
    Basic Pay: $5,000.00 | Net Payable: $6,200.00
    Employee Provident Fund: $400.00
    """
    valid2, reason2 = is_candidate_resume(payslip_text, "payslip_aug24.pdf")
    assert valid2 is False
    assert "rejected" in reason2.lower()


def test_is_candidate_resume_rejects_standalone_cover_letters() -> None:
    cover_letter_text = """
    Dear Hiring Manager,
    I am writing to apply for the Senior DevOps Engineer position at your organization.
    I have extensive background in Kubernetes and cloud infrastructure.
    Please find attached my resume for your review.
    Thank you for your consideration.
    Sincerely,
    David Miller
    """
    valid, reason = is_candidate_resume(cover_letter_text, "cover_letter.pdf")
    assert valid is False
    assert "rejected" in reason.lower()


def test_is_candidate_resume_rejects_non_resume_filenames_even_with_text() -> None:
    text = "John Doe\njohn@example.com\nPython, Docker, SQL\n4 years experience"
    # An academic certificate filename should be rejected
    valid, reason = is_candidate_resume(text, "degree_certificate.pdf")
    assert valid is False
    assert "filename indicates a non-resume" in reason.lower()

    # A passport or ID scan filename should be rejected
    valid2, reason2 = is_candidate_resume(text, "passport_copy.pdf")
    assert valid2 is False
    assert "filename indicates a non-resume" in reason2.lower()


def test_is_candidate_resume_rejects_structured_bank_application_forms() -> None:
    bank_form_text = """
    State Bank of India
    Application for the post of Branch Manager
    Registration Number: SBI/2026/4521
    Identification Marks: Mole on left cheek
    1. Name: Rahul Kumar
    2. Date of Birth: 15-06-1985
    3. Father's Name: Suresh Kumar
    4. Permanent Address: MG Road, Bengaluru
    Category: General
    Educational Qualification: MBA (Banking & Finance)
    Work Experience: 12 years
    Declaration: I hereby declare that the information provided is true.
    Signature of the Applicant: Rahul Kumar
    """
    valid, reason = is_candidate_resume(bank_form_text, "bank_application_form.pdf")
    assert valid is False
    assert "application form" in reason.lower()


def test_is_candidate_resume_accepts_real_cv_with_common_indian_fields() -> None:
    # A genuine CV that happens to list DOB / father's name MUST still be accepted
    resume_text = """
    Rahul Kumar
    rahul@example.com | +91 98450 12345 | Bengaluru
    Date of Birth: 15-06-1985 | Father's Name: Suresh Kumar
    Summary:
    Senior Branch Operations Manager with 12 years of experience in retail banking.
    Experience:
    Branch Manager - Axis Bank (2018 - Present)
    Senior Officer - HDFC Bank (2013 - 2018)
    Skills: Retail Banking, Portfolio Management, Team Leadership, KYC, Risk Management
    Education: MBA in Banking & Finance, B.Com
    """
    valid, reason = is_candidate_resume(resume_text, "rahul_kumar_cv.pdf")
    assert valid is True, reason


def test_classify_email_context_identifies_candidate_applications() -> None:
    # 1. Subject has explicit application signal
    is_cand, is_disq, reason = classify_email_context(
        subject="Application for Senior Backend Engineer - Alex Doe",
        snippet="Dear Hiring Manager, please find attached my resume.",
        body="I am applying for the backend role. I have 6 years of experience.",
    )
    assert is_cand is True
    assert is_disq is False
    assert "application" in reason.lower()

    # 2. Body has written application phrasing
    is_cand2, is_disq2, reason2 = classify_email_context(
        subject="Profile submission",
        snippet="Attached is my CV for your review",
        body="Please find attached my CV. Notice period is 30 days. Current CTC is 15 LPA.",
    )
    assert is_cand2 is True
    assert is_disq2 is False


def test_classify_email_context_disqualifies_invoices_tickets_and_statements() -> None:
    # 1. Invoice email
    is_cand, is_disq, reason = classify_email_context(
        subject="Tax Invoice #INV-2024-8891 from AWS Cloud",
        snippet="Your monthly billing statement is attached.",
        body="Payment receipt. Amount due $450.",
    )
    assert is_cand is False
    assert is_disq is True
    assert "non-recruitment" in reason.lower()

    # 2. Flight ticket / Boarding pass email
    is_cand2, is_disq2, reason2 = classify_email_context(
        subject="Your Boarding Pass & E-Ticket for AI-202",
        snippet="Flight booking confirmation.",
        body="Flight departure at 10:00 AM.",
    )
    assert is_cand2 is False
    assert is_disq2 is True
    assert "non-recruitment" in reason2.lower()

    # 3. Monthly bank / payroll statement
    is_cand3, is_disq3, reason3 = classify_email_context(
        subject="Your Account Statement for August 2024",
        snippet="Statement of account enclosed.",
        body="Account balance and transactions.",
    )
    assert is_cand3 is False
    assert is_disq3 is True




