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
    "invoice",
    "receipt",
    "bill",
    "quotation",
    "quote",
    "statement",
    "tax_invoice",
    "taxinvoice",
    "purchase_order",
    "po_",
    "order_confirmation",
    "challan",
    "timesheet",
    "expense",
    # Salary, payroll & tax
    "payslip",
    "pay_slip",
    "salary_slip",
    "salaryslip",
    "form_16",
    "form16",
    "form_26as",
    "w2",
    "w-2",
    "w4",
    "w-4",
    "1099",
    "bank_statement",
    "bank_passbook",
    "gst",
    "itr_",
    "itrv",
    "cheque",
    "check",
    # Academic certificates, transcripts & degrees
    "certificate",
    "certification",
    "marksheet",
    "mark_sheet",
    "marks_sheet",
    "transcript",
    "degree",
    "diploma",
    "grade_card",
    "gradecard",
    "convocation",
    "provisional",
    "bonafide",
    # Identity & government records
    "passport",
    "visa",
    "aadhar",
    "adhaar",
    "pan_card",
    "pancard",
    "driving_licence",
    "driving_license",
    "national_id",
    "id_card",
    "idcard",
    "voter_id",
    "voterid",
    "ssn",
    # Company employment letters & contracts
    "offer_letter",
    "offerletter",
    "appointment_letter",
    "appointmentletter",
    "relieving_letter",
    "relievingletter",
    "experience_letter",
    "experienceletter",
    "service_certificate",
    "hike_letter",
    "increment_letter",
    "appraisal_letter",
    "internship_letter",
    "joining_letter",
    "nda",
    "contract",
    "agreement",
    "license",
    # Letters & work collateral
    "cover_letter",
    "coverletter",
    "cover-letter",
    "recommendation",
    "letter_of_recommendation",
    "lor_",
    "lor.",
    "lor-",
    "portfolio",
    "project_report",
    "assignment",
    "whitepaper",
    "case_study",
    "brochure",
    "flyer",
    "newsletter",
    "presentation",
    "slides",
    "deck",
    "manual",
    "specification",
    # Travel & tickets
    "ticket",
    "boarding_pass",
    "boardingpass",
    "eticket",
    "e-ticket",
    "booking",
    "itinerary",
    # Generic scans
    "camscanner",
    "scanned_doc",
    "scan_doc",
]

NON_RESUME_DOC_MARKERS = [
    # Invoices & billing
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
    "total payable",
    "net amount",
    "taxable amount",
    # Academic certificates, transcripts & marks
    "certificate of completion",
    "certificate of achievement",
    "certificate of participation",
    "certificate of appreciation",
    "this is to certify that",
    "this certificate is awarded to",
    "has successfully completed the",
    "has been awarded the degree",
    "conferred upon",
    "degree of bachelor",
    "degree of master",
    "statement of marks",
    "marks sheet",
    "marks card",
    "academic transcript",
    "controller of examinations",
    "cumulative grade point",
    "semester examination",
    "grade report",
    "provisional certificate",
    "hall ticket",
    # Employment / HR letters & agreements
    "to whom it may concern",
    "to whomsoever it may concern",
    "we are pleased to offer you",
    "letter of offer",
    "letter of appointment",
    "terms of your employment",
    "relieving letter",
    "relieving-cum-experience",
    "service certificate",
    "hereby relieved from the services",
    "probation period",
    "non-disclosure agreement",
    "mutual non-disclosure",
    "confidentiality agreement",
    # Payslips & compensation
    "salary slip for the month",
    "payslip for the month",
    "basic pay",
    "gross salary",
    "net payable",
    "employee provident fund",
    "uan no",
    "pf number",
    "provident fund organization",
    "total deductions",
    # Travel & tickets
    "boarding pass",
    "e-ticket",
    "booking confirmation",
    "passenger name",
    "flight number",
    "pnr:",
    "pnr no",
    "gate / seat",
    "baggage allowance",
    # Banking & accounts
    "bank statement",
    "statement of account",
    "account summary",
    "transaction history",
    "available balance",
    "opening balance",
    "closing balance",
    # Marketing / Newsletters
    "unsubscribe",
    "view in browser",
    "email preferences",
    # Standalone cover letter phrases
    "dear hiring manager",
    "dear recruiter",
    "i am writing to apply for",
    "i am writing to express my interest in",
    "please find attached my resume",
    "please find enclosed my resume",
    "thank you for your consideration",
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
    has_resume_in_name = any(kw in lower_name for kw in ("resume", "cv", "curriculum", "biodata"))
    has_resume_header = any(marker in normalized for marker in ("curriculum vitae", "resume", "cv", "bio-data", "biodata"))

    has_exp_section = any(
        marker in normalized
        for marker in (
            "experience",
            "work experience",
            "employment history",
            "work history",
            "professional experience",
            "career history",
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
        )
    )
    section_count = sum([has_exp_section, has_edu_section, has_skill_section, has_project_or_summary])

    has_contact = bool(CONTACT_EMAIL_REGEX.search(normalized) or CONTACT_PHONE_REGEX.search(normalized))
    has_date_ranges = bool(CAREER_EXPERIENCE_REGEX.search(normalized) or CAREER_DATE_RANGE_REGEX.search(normalized))
    has_career_title = any(title in normalized for title in CAREER_TITLE_MARKERS)
    has_tech_skills = any(kw in normalized for cat in SKILL_CATEGORIES for kw in cat["keywords"])

    # If the file or content explicitly labels itself as a resume/CV
    if has_resume_in_name or has_resume_header:
        if section_count >= 1 or has_tech_skills or (has_career_title and has_contact):
            return True, "Valid candidate resume"

    # For files without explicit 'resume' or 'cv' in their name:
    # Require genuine candidate resume structure (sections, experience, or skills)
    is_structured_resume = (
        (section_count >= 2)
        or (section_count >= 1 and (has_contact or has_date_ranges) and (has_career_title or has_tech_skills))
        or (has_contact and (has_career_title or has_tech_skills) and (has_date_ranges or section_count >= 1))
        or (has_career_title and has_tech_skills and has_date_ranges)
    )

    if not is_structured_resume:
        return (
            False,
            "File rejected: document lacks candidate resume structure (missing standard experience, education, or skill sections).",
        )

    return True, "Valid candidate resume"

