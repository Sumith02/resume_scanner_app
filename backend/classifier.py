from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

SKILL_CATEGORIES = [
    {
        "key": "backend",
        "label": "Backend",
        "description": "API, server, database, and service engineering",
        "accent": "#2563eb",
        "keywords": [
            "node.js",
            "nodejs",
            "express",
            "nestjs",
            "java",
            "spring boot",
            "python",
            "django",
            "flask",
            "fastapi",
            "go",
            "golang",
            "ruby on rails",
            "laravel",
            ".net",
            "c#",
            "php",
            "rest api",
            "graphql",
            "microservices",
            "postgresql",
            "mysql",
            "mongodb",
            "redis",
            "kafka",
            "rabbitmq",
            "system design",
        ],
    },
    {
        "key": "frontend",
        "label": "Frontend",
        "description": "Web UI, design systems, and client-side engineering",
        "accent": "#0891b2",
        "keywords": [
            "react",
            "next.js",
            "vue",
            "nuxt",
            "angular",
            "svelte",
            "typescript",
            "javascript",
            "html",
            "css",
            "tailwind",
            "redux",
            "zustand",
            "webpack",
            "vite",
            "storybook",
            "responsive design",
            "web accessibility",
            "frontend",
        ],
    },
    {
        "key": "machine_learning",
        "label": "Machine Learning",
        "description": "ML models, NLP, computer vision, and applied AI",
        "accent": "#7c3aed",
        "keywords": [
            "machine learning",
            "deep learning",
            "artificial intelligence",
            "tensorflow",
            "pytorch",
            "keras",
            "scikit-learn",
            "sklearn",
            "nlp",
            "computer vision",
            "opencv",
            "transformer",
            "llm",
            "rag",
            "mlops",
            "model training",
            "feature engineering",
            "data science",
            "python",
        ],
    },
    {
        "key": "data_engineering",
        "label": "Data Engineering",
        "description": "Pipelines, analytics, warehousing, and BI",
        "accent": "#16a34a",
        "keywords": [
            "spark",
            "pyspark",
            "airflow",
            "dbt",
            "etl",
            "elt",
            "data warehouse",
            "bigquery",
            "snowflake",
            "redshift",
            "databricks",
            "hadoop",
            "sql",
            "tableau",
            "power bi",
            "looker",
            "analytics",
            "data pipeline",
            "data modeling",
        ],
    },
    {
        "key": "devops",
        "label": "DevOps",
        "description": "Cloud, CI/CD, infrastructure, and reliability",
        "accent": "#ea580c",
        "keywords": [
            "aws",
            "azure",
            "gcp",
            "docker",
            "kubernetes",
            "terraform",
            "ansible",
            "jenkins",
            "github actions",
            "gitlab ci",
            "ci/cd",
            "linux",
            "prometheus",
            "grafana",
            "sre",
            "observability",
            "helm",
            "cloudformation",
        ],
    },
    {
        "key": "mobile",
        "label": "Mobile",
        "description": "iOS, Android, and cross-platform app development",
        "accent": "#db2777",
        "keywords": [
            "react native",
            "flutter",
            "android",
            "ios",
            "swift",
            "kotlin",
            "xcode",
            "android studio",
            "mobile app",
            "jetpack compose",
            "objective-c",
            "dart",
        ],
    },
    {
        "key": "qa",
        "label": "QA Automation",
        "description": "Manual testing, automation, and release quality",
        "accent": "#ca8a04",
        "keywords": [
            "selenium",
            "cypress",
            "playwright",
            "jest",
            "vitest",
            "testing",
            "test automation",
            "manual testing",
            "qa",
            "quality assurance",
            "postman",
            "jmeter",
            "regression testing",
            "api testing",
        ],
    },
    {
        "key": "ui_ux",
        "label": "UI/UX Design",
        "description": "Product design, UX research, and design systems",
        "accent": "#9333ea",
        "keywords": [
            "figma",
            "adobe xd",
            "sketch",
            "wireframes",
            "prototype",
            "user research",
            "ux design",
            "ui design",
            "design system",
            "interaction design",
            "visual design",
            "usability",
        ],
    },
    {
        "key": "product_management",
        "label": "Product Management",
        "description": "Roadmaps, requirements, stakeholder and delivery ownership",
        "accent": "#0f766e",
        "keywords": [
            "product management",
            "product manager",
            "roadmap",
            "prd",
            "user stories",
            "scrum",
            "agile",
            "jira",
            "stakeholder management",
            "go to market",
            "market research",
            "product strategy",
        ],
    },
    {
        "key": "business_ops",
        "label": "Business Operations",
        "description": "Sales, marketing, finance, HR, and business support roles",
        "accent": "#64748b",
        "keywords": [
            "sales",
            "marketing",
            "seo",
            "sem",
            "crm",
            "hubspot",
            "finance",
            "accounting",
            "operations",
            "human resources",
            "recruitment",
            "talent acquisition",
            "customer success",
            "business development",
        ],
    },
]

KNOWN_LOCATIONS = [
    ("Bengaluru", "Karnataka", "India", "bangalore"),
    ("Hyderabad", "Telangana", "India"),
    ("Pune", "Maharashtra", "India"),
    ("Mumbai", "Maharashtra", "India", "bombay"),
    ("Navi Mumbai", "Maharashtra", "India"),
    ("Thane", "Maharashtra", "India"),
    ("Chennai", "Tamil Nadu", "India"),
    ("Delhi", "Delhi", "India", "new delhi"),
    ("Gurugram", "Haryana", "India", "gurgaon"),
    ("Noida", "Uttar Pradesh", "India"),
    ("Kolkata", "West Bengal", "India"),
    ("Ahmedabad", "Gujarat", "India"),
    ("Jaipur", "Rajasthan", "India"),
    ("Indore", "Madhya Pradesh", "India"),
    ("Kochi", "Kerala", "India", "cochin"),
    ("Thiruvananthapuram", "Kerala", "India", "trivandrum"),
    ("Coimbatore", "Tamil Nadu", "India"),
    ("Chandigarh", "Chandigarh", "India"),
    ("Lucknow", "Uttar Pradesh", "India"),
    ("Bhubaneswar", "Odisha", "India"),
    ("Nagpur", "Maharashtra", "India"),
    ("Surat", "Gujarat", "India"),
    ("Vadodara", "Gujarat", "India"),
    ("Visakhapatnam", "Andhra Pradesh", "India", "vizag"),
    ("San Francisco", "California", "United States"),
    ("San Jose", "California", "United States"),
    ("Seattle", "Washington", "United States"),
    ("New York", "New York", "United States", "nyc"),
    ("Austin", "Texas", "United States"),
    ("Dallas", "Texas", "United States"),
    ("Boston", "Massachusetts", "United States"),
    ("Chicago", "Illinois", "United States"),
    ("Atlanta", "Georgia", "United States"),
    ("Toronto", "Ontario", "Canada"),
    ("Vancouver", "British Columbia", "Canada"),
    ("London", "England", "United Kingdom"),
    ("Berlin", "Berlin", "Germany"),
    ("Dublin", "Leinster", "Ireland"),
    ("Singapore", "Singapore", "Singapore"),
    ("Dubai", "Dubai", "United Arab Emirates"),
    ("Abu Dhabi", "Abu Dhabi", "United Arab Emirates"),
    ("Sydney", "New South Wales", "Australia"),
    ("Melbourne", "Victoria", "Australia"),
]


def analyze_resume(text: str, fallback_name: str) -> dict[str, object]:
    normalized = _normalize_text(text)
    name = _extract_name(normalized, fallback_name)
    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", normalized, re.I)
    phone_match = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", normalized)
    location = _extract_location(normalized)
    skills = _classify_skills(normalized)
    experience = _extract_experience(normalized)
    matched = skills["matchedSkills"]
    summary_parts = [f"{name} is primarily aligned with {skills['primarySkill']} roles."]
    if matched:
        summary_parts.append(f"Strongest detected signals: {', '.join(matched[:5])}.")
    if experience is not None:
        summary_parts.append(f"Resume indicates up to {experience:g} years of experience.")
    if location["location"] != "Unknown":
        summary_parts.append(f"Location signal: {location['location']}.")

    return {
        "candidateName": name,
        "email": email_match.group(0) if email_match else "",
        "phone": re.sub(r"\s+", " ", phone_match.group(0)).strip() if phone_match else "",
        **location,
        **skills,
        "experienceYears": experience,
        "summary": " ".join(summary_parts),
        "textPreview": normalized[:1600],
        "resumeTextLength": len(normalized),
    }


def _normalize_text(text: str) -> str:
    text = text.replace("\r", "\n")
    text = re.sub(r"[^\S\n]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _classify_skills(text: str) -> dict[str, object]:
    lower = text.lower()
    scores: dict[str, int] = {}
    found: Counter[str] = Counter()
    for category in SKILL_CATEGORIES:
        score = 0
        for keyword in category["keywords"]:
            pattern = rf"(?<![a-z0-9+#.]){re.escape(keyword).replace(r'\ ', r'\s+')}(?=[^a-z0-9+#.]|$)"
            matches = len(re.findall(pattern, lower))
            if matches:
                capped = min(matches, 4)
                score += capped * (2 if " " in keyword or len(keyword) >= 10 else 1)
                found[_pretty_keyword(keyword)] += capped
        scores[category["key"]] = score

    primary_key, top_score = max(scores.items(), key=lambda item: item[1], default=("general", 0))
    primary = next((item for item in SKILL_CATEGORIES if item["key"] == primary_key), None)
    matched = [skill for skill, _ in sorted(found.items(), key=lambda item: (-item[1], item[0]))[:18]]
    return {
        "primarySkill": primary["label"] if primary and top_score else "General Review",
        "primarySkillKey": primary_key if primary and top_score else "general",
        "skillScores": scores,
        "skillScorePercent": min(100, round((top_score / 18) * 100)) if top_score else 0,
        "matchedSkills": matched,
    }


def _extract_name(text: str, fallback_name: str) -> str:
    blocked = re.compile(
        r"resume|curriculum|vitae|email|phone|mobile|address|linkedin|github|portfolio|summary|objective|experience|education|skills",
        re.I,
    )
    skill_terms = {keyword for category in SKILL_CATEGORIES for keyword in category["keywords"]}
    for line in [line.strip() for line in text.splitlines() if line.strip()][:18]:
        words = line.split()
        has_skill_term = any(term in line.lower() for term in skill_terms)
        if (
            3 <= len(line) <= 60
            and 2 <= len(words) <= 5
            and "@" not in line
            and not re.search(r"\d{4,}", line)
            and not blocked.search(line)
            and not has_skill_term
        ):
            return _title_case(line)
    return _title_case(re.sub(r"[_-]+", " ", Path(fallback_name).stem))


def _extract_experience(text: str) -> float | None:
    values = [float(value) for value in re.findall(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years|year|yrs|yr)\b", text, re.I)]
    valid = [value for value in values if 0 <= value <= 60]
    return max(valid) if valid else None


def _extract_location(text: str) -> dict[str, object]:
    if re.search(r"\b(remote|work from home|wfh)\b", text, re.I):
        return {"location": "Remote", "city": "Remote", "region": "", "country": "", "locationConfidence": 0.74}
    lines = [line.strip() for line in text.splitlines() if line.strip()][:80]
    explicit = "\n".join(
        line for line in lines if re.search(r"location|address|based in|current city|city\s*:", line, re.I)
    )
    for haystack, confidence in ((explicit, 0.92), ("\n".join(lines), 0.82), (text, 0.63)):
        lower = haystack.lower()
        for entry in sorted(KNOWN_LOCATIONS, key=lambda item: -len(item[0])):
            city, region, country, *aliases = entry
            if any(re.search(rf"(?<![a-z]){re.escape(name.lower())}(?![a-z])", lower) for name in (city, *aliases)):
                return {
                    "location": ", ".join(dict.fromkeys((city, region, country))),
                    "city": city,
                    "region": region,
                    "country": country,
                    "locationConfidence": confidence,
                }
    return {"location": "Unknown", "city": "", "region": "", "country": "", "locationConfidence": 0}


def _pretty_keyword(value: str) -> str:
    special = {
        "aws": "AWS",
        "gcp": "GCP",
        "sql": "SQL",
        "nlp": "NLP",
        "llm": "LLM",
        "qa": "QA",
        "ios": "iOS",
        "php": "PHP",
    }
    return special.get(value, " ".join(word.capitalize() for word in value.split()))


def _title_case(value: str) -> str:
    return " ".join(
        word if word.isupper() and len(word) <= 4 else word[:1].upper() + word[1:].lower() for word in value.split()
    )

NON_RESUME_FILENAMES = [
    # Invoices & billing
    "tax_invoice",
    "taxinvoice",
    "commercial_invoice",
    "proforma_invoice",
    "purchase_order",
    "order_confirmation",
    "timesheet",
    # Salary, payroll & tax
    "salary_slip",
    "salaryslip",
    "form_16",
    "form16",
    "form_26as",
    "bank_statement",
    "bank_passbook",
    # Academic certificates & marksheets
    "degree_certificate",
    "marksheet",
    "mark_sheet",
    "marks_sheet",
    "academic_transcript",
    "grade_card",
    "gradecard",
    # Identity & government records
    "passport_copy",
    "passport_scan",
    "driving_licence",
    "driving_license",
    "voter_id",
    "voterid",
    # Employment letters
    "offer_letter",
    "offerletter",
    "appointment_letter",
    "appointmentletter",
    "relieving_letter",
    "relievingletter",
    "experience_letter",
    "experienceletter",
    "service_certificate",
    # Standalone cover letters
    "cover_letter",
    "coverletter",
    "cover-letter",
    # Travel & tickets
    "boarding_pass",
    "boardingpass",
    "flight_ticket",
]

NON_RESUME_DOC_MARKERS = [
    # Invoices & billing
    "tax invoice",
    # Academic certificates, transcripts & marks
    "certificate of participation",
    "certificate of appreciation",
    "this is to certify that",
    "this certificate is awarded to",
    "has successfully completed the",
    "statement of marks",
    "marks sheet",
    "marks card",
    "academic transcript",
    "controller of examinations",
    "semester examination",
    "grade report",
    "provisional certificate",
    "hall ticket",
    # Employment / HR letters & agreements
    "terms of your employment",
    "relieving letter",
    "relieving-cum-experience",
    "service certificate",
    "hereby relieved from the services",
    "non-disclosure agreement",
    "mutual non-disclosure",
    "confidentiality agreement",
    # Payslips & compensation
    "salary slip for the month",
    # Banking & accounts
    "account summary",
    "transaction history",
    "available balance",
    "opening balance",
    "closing balance",
    # Standalone cover letter phrases
    "dear hiring manager",
    "dear recruiter",
    "i am writing to apply for",
    "i am writing to express my interest in",
    "please find attached my resume",
    "please find enclosed my resume",
    "thank you for your consideration",
]

APPLICATION_FORM_MARKERS = [
    # Structured application forms: bank/PSU, government, and campus placement forms.
    # Deliberately excludes common resume fields (date of birth, father's name,
    # permanent address, marital status) to avoid rejecting genuine Indian CVs.
    "application for the post of",
    "post applied for",
    "post for which applied",
    "identification marks",
    "passport size photograph",
    "passport size photo",
    "applicant's signature",
    "applicants signature",
    "signature of the applicant",
    "signature of the candidate",
    "application number",
    "registration number",
    "register number",
    "roll number",
    "branch opted",
    "centre code",
    "center code",
    "application fee",
    "category applied for",
    "hereby declare",
    "do hereby declare",
    "examination centre",
    "exam centre",
]

INVOICE_KEYWORDS = [
    "tax invoice",
    "commercial invoice",
    "proforma invoice",
    "invoice no",
    "invoice #",
    "invoice date",
    "bill to",
    "billed to",
    "ship to",
    "shipped to",
    "amount due",
    "total due",
    "subtotal",
    "balance due",
    "payment terms",
    "due date",
    "purchase order",
    "po number",
    "unit price",
    "vat number",
    "vat no",
    "gstin",
    "gst no",
    "hsn/sac",
    "bank details",
    "ifsc code",
    "swift code",
    "remit to",
    "terms of payment",
    "description of goods",
    "total payable",
    "net amount",
]

RESUME_SECTION_MARKERS = [
    "experience",
    "work experience",
    "employment history",
    "professional experience",
    "work history",
    "career history",
    "education",
    "academic background",
    "qualification",
    "qualifications",
    "skills",
    "technical skills",
    "core competencies",
    "key skills",
    "technologies",
    "projects",
    "personal projects",
    "academic projects",
    "summary",
    "professional summary",
    "executive summary",
    "career objective",
    "about me",
    "certifications",
    "licenses & certifications",
    "curriculum vitae",
    "resume",
    "curriculum-vitae",
    "bio-data",
    "biodata",
]


CAREER_TITLE_MARKERS = [
    "engineer",
    "developer",
    "programmer",
    "designer",
    "architect",
    "manager",
    "consultant",
    "analyst",
    "specialist",
    "administrator",
    "coordinator",
    "scientist",
    "intern",
    "lead",
    "officer",
    "director",
]

CAREER_EXPERIENCE_REGEX = re.compile(r"\b\d+(?:\.\d+)?\s*\+?\s*(?:years?|yrs?)\b", re.I)
CAREER_DATE_RANGE_REGEX = re.compile(
    r"\b(?:20\d\d|19\d\d)\s*(?:-|–|to)\s*(?:20\d\d|19\d\d|present|current)\b", re.I
)
CONTACT_EMAIL_REGEX = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
CONTACT_PHONE_REGEX = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")


def is_candidate_resume(text: str, filename: str) -> tuple[bool, str]:
    lower_name = filename.lower()
    for non_resume_kw in NON_RESUME_FILENAMES:
        if non_resume_kw in lower_name:
            if "resume" not in lower_name and "cv" not in lower_name and "curriculum" not in lower_name and "biodata" not in lower_name:
                return False, f"File rejected: filename indicates a non-resume attachment ('{filename}')."

    normalized = _normalize_text(text).lower()

    if len(normalized) < 50:
        return False, "File rejected: document text is too brief to be a candidate resume."

    # 1. Non-resume marker checks
    non_resume_hits = [kw for kw in NON_RESUME_DOC_MARKERS if kw in normalized]
    if len(non_resume_hits) >= 2:
        return False, f"File rejected: document contains non-resume markers ({', '.join(non_resume_hits[:3])})."

    if len(non_resume_hits) == 1:
        strong_disqualifiers = [
            "tax invoice",
            "commercial invoice",
            "boarding pass",
            "e-ticket",
            "certificate of completion",
            "this is to certify that",
            "statement of marks",
            "academic transcript",
            "salary slip for the month",
            "payslip for the month",
            "we are pleased to offer you",
            "letter of appointment",
            "relieving letter",
            "to whomsoever it may concern",
            "to whom it may concern",
        ]
        if any(sd in normalized for sd in strong_disqualifiers):
            if "resume" not in lower_name and "cv" not in lower_name:
                return False, f"File rejected: document is not a candidate resume ({non_resume_hits[0]})."

    # 2. Structural checks
    has_resume_in_name = any(kw in lower_name for kw in ("resume", "cv", "curriculum", "biodata", "profile"))
    has_resume_header = any(marker in normalized for marker in ("curriculum vitae", "resume", "cv", "bio-data", "biodata", "candidate profile"))

    # 2b. Structured application form check: bank/PSU and government application
    # forms carry template boilerplate that a real resume never contains. Reject
    # when several of these appear and the document does not self-label as a resume.
    application_form_hits = [marker for marker in APPLICATION_FORM_MARKERS if marker in normalized]
    if len(application_form_hits) >= 2 and not (has_resume_in_name or has_resume_header):
        return (
            False,
            f"File rejected: document is a structured application form rather than a candidate resume ({', '.join(application_form_hits[:3])}).",
        )

    has_exp_section = any(
        marker in normalized
        for marker in (
            "experience",
            "work experience",
            "employment history",
            "work history",
            "professional experience",
            "career history",
            "employment",
            "internship",
        )
    )
    has_edu_section = any(
        marker in normalized
        for marker in (
            "education",
            "academic background",
            "qualification",
            "qualifications",
            "bachelor",
            "master",
            "b.tech",
            "m.tech",
            "b.sc",
            "degree",
            "university",
            "college",
        )
    )
    has_skill_section = any(
        marker in normalized
        for marker in (
            "skills",
            "technical skills",
            "core competencies",
            "key skills",
            "technologies",
            "tech stack",
            "tools",
            "competencies",
            "toolkit",
        )
    )
    has_project_or_summary = any(
        marker in normalized
        for marker in (
            "projects",
            "personal projects",
            "academic projects",
            "summary",
            "professional summary",
            "profile summary",
            "career objective",
            "about me",
            "overview",
        )
    )
    section_count = sum([has_exp_section, has_edu_section, has_skill_section, has_project_or_summary])

    has_contact = bool(CONTACT_EMAIL_REGEX.search(normalized) or CONTACT_PHONE_REGEX.search(normalized))
    has_date_ranges = bool(CAREER_EXPERIENCE_REGEX.search(normalized) or CAREER_DATE_RANGE_REGEX.search(normalized))
    has_career_title = any(title in normalized for title in CAREER_TITLE_MARKERS)
    has_tech_skills = any(kw in normalized for cat in SKILL_CATEGORIES for kw in cat["keywords"])

    # If the file or content explicitly labels itself as a resume/CV
    if has_resume_in_name or has_resume_header:
        if section_count >= 1 or has_tech_skills or has_career_title or has_contact or len(normalized) >= 50:
            return True, "Valid candidate resume"

    # Standalone cover letter check: cover letter phrasing without technical skills or work experience
    cover_letter_signals = [
        "dear hiring manager",
        "dear recruiter",
        "i am writing to apply for",
        "please find attached my resume",
        "thank you for your consideration",
    ]
    cl_hits = [cls for cls in cover_letter_signals if cls in normalized]
    if len(cl_hits) >= 2 and not has_resume_in_name and not has_tech_skills and not has_exp_section:
        return False, "File rejected: document is a standalone cover letter rather than a resume."

    # For all candidate documents: Accept if it has genuine candidate signals:
    # (skills, candidate sections, career title, or professional experience)
    is_structured_resume = (
        (section_count >= 1)
        or has_tech_skills
        or (has_career_title and (has_contact or has_date_ranges))
        or (has_contact and (has_career_title or has_date_ranges or has_exp_section or has_edu_section or has_tech_skills))
        or (has_date_ranges and (has_career_title or has_contact or has_tech_skills or section_count >= 1))
    )

    if not is_structured_resume:
        return (
            False,
            "File rejected: document lacks candidate resume structure (missing standard experience, education, or skill sections).",
        )

    return True, "Valid candidate resume"


NON_APPLICATION_EMAIL_SUBJECTS = [
    # Invoices, billing, receipts
    "tax invoice",
    "commercial invoice",
    "proforma invoice",
    "invoice #",
    "invoice no",
    "invoice date",
    "payment receipt",
    "receipt for your payment",
    "payment confirmation",
    "billing statement",
    "account statement",
    "monthly statement",
    "statement of account",
    "statement for",
    "bank statement",
    "credit card statement",
    # Travel & transit tickets
    "boarding pass",
    "e-ticket",
    "flight ticket",
    "flight confirmation",
    "airline booking",
    "hotel reservation",
    "booking confirmation",
    "itinerary for",
    # E-commerce, shipping & orders
    "order confirmation",
    "order #",
    "shipping update",
    "delivery notification",
    "package delivered",
    "tracking number",
    # Marketing & notifications
    "newsletter",
    "weekly digest",
    "monthly digest",
    "security alert",
    "password reset",
    "subscription renewed",
    "terms of service update",
    # Payroll & compensation slips
    "salary slip for the month",
    "payslip for the month",
]

APPLICATION_EMAIL_SIGNALS = [
    # Subject signals
    "application for",
    "applying for",
    "job application",
    "resume for",
    "cv for",
    "resume of",
    "cv of",
    "curriculum vitae",
    "candidate profile",
    "profile for the position",
    "profile for the role",
    "submission for the role",
    "applying for the position",
    "applying for the role",
    "application:",
    "candidate:",
    "applicant:",
    "job applicant",
    "open application",
    # Body keywords / phrases written by candidates
    "please find attached my resume",
    "please find attached my cv",
    "find attached my resume",
    "find attached my cv",
    "attached my resume",
    "attached my cv",
    "attached is my resume",
    "attached is my cv",
    "enclosed my resume",
    "enclosed my cv",
    "enclosed is my resume",
    "here is my resume",
    "here is my cv",
    "my resume is attached",
    "my cv is attached",
    "i am applying for",
    "application for the position",
    "application for the role",
    "interest in the position",
    "consider my profile",
    "consider my candidature",
    "consider my application",
    "years of experience",
    "current ctc",
    "expected ctc",
    "notice period",
]


def classify_email_context(subject: str, snippet: str, body: str = "") -> tuple[bool, bool, str]:
    """
    Evaluates email metadata and written text in 2 ways:
    Returns (is_candidate_email, is_disqualified, reason)

    Way 1: Detects if the email itself is explicitly NOT a recruitment email
           (e.g. invoice, flight ticket, bank statement, order confirmation)
           -> is_disqualified = True.
    Way 2: Detects if the email contains written candidate application signals
           (e.g. 'applying for', 'attached my resume', 'job application', 'notice period')
           -> is_candidate_email = True.
    """
    lower_subject = subject.lower().strip()
    combined_text = f"{lower_subject} {snippet.lower()} {body.lower()[:3000]}".strip()

    # 1. Fast disqualification check: Non-recruitment emails (invoices, tickets, newsletters)
    for pattern in NON_APPLICATION_EMAIL_SUBJECTS:
        if pattern in lower_subject:
            return False, True, f"Email subject indicates non-recruitment message ('{pattern}')."

    # Also check snippet/body for non-recruitment indicators if subject is ambiguous
    disqualifier_hits = [p for p in NON_APPLICATION_EMAIL_SUBJECTS if p in combined_text]
    if len(disqualifier_hits) >= 2:
        return False, True, f"Email content indicates non-recruitment message ({', '.join(disqualifier_hits[:2])})."

    # 2. Candidate application signal detection
    subject_has_app_signal = any(signal in lower_subject for signal in APPLICATION_EMAIL_SIGNALS[:18])
    body_has_app_signal = any(signal in combined_text for signal in APPLICATION_EMAIL_SIGNALS)

    if subject_has_app_signal or body_has_app_signal:
        matched = [s for s in APPLICATION_EMAIL_SIGNALS if s in combined_text]
        match_desc = matched[0] if matched else "application keywords"
        return True, False, f"Candidate application email detected ('{match_desc}')."

    return False, False, "General email without explicit application markers."


