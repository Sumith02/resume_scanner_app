from __future__ import annotations

import io
import re
import uuid
from datetime import datetime

SKILL_LEXICON = [
    "python", "python3", "java", "javascript", "typescript", "golang", "go",
    "rust", "c++", "c#", "csharp", "ruby", "php", "swift", "kotlin", "scala",
    "sql", "postgres", "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
    "dynamodb", "oracle", "mssql", "sqlite",
    "react", "redux", "next.js", "nextjs", "vue", "angular", "svelte", "node.js",
    "nodejs", "express", "fastapi", "django", "flask", "spring", "rails",
    "html", "html5", "css", "css3", "tailwind", "bootstrap", "sass", "scss",
    "webpack", "vite", "frontend", "backend", "full stack", "web development",
    "software engineering", "software developer", "frontend developer", "backend developer",
    "docker", "kubernetes", "k8s", "terraform", "ansible", "aws", "gcp",
    "azure", "linux", "git", "ci/cd", "jenkins", "github actions", "graphql",
    "rest api", "restful", "grpc", "websockets", "microservices", "serverless",
    "json", "xml", "nosql", "firebase", "supabase", "prisma",
    "testing", "jest", "cypress", "selenium", "unit test", "automation", "qa",
    "machine learning", "ml", "deep learning", "nlp", "natural language processing",
    "computer vision", "pandas", "numpy", "tensorflow", "pytorch", "scikit-learn",
    "data science", "data analysis", "etl", "spark", "airflow", "databricks",
    "tableau", "power bi", "looker", "excel",
    "product management", "agile", "scrum", "kanban",
    "jira", "confluence", "figma", "sketch", "design", "ui/ux", "ux design",
    "ui design", "prototyping", "user research",
    "flutter", "dart", "react native", "android", "ios",
    "salesforce", "hubspot", "marketing", "seo", "content marketing",
    "crm", "saas", "fintech", "e-commerce", "ecommerce",
    "leadership", "team leadership", "project management", "stakeholder management",
    "communication", "go-to-market", "gtm", "account management",
    "recruitment", "talent acquisition", "sourcing", "ats", "boolean search",
    "linkedin", "hiring", "staffing", "hr", "human resources", "payroll",
    "bash", "shell", "powershell", "api", "oauth", "jwt", "security",
    "cybersecurity", "penetration testing", "soc", "devops", "sre",
    "networking", "tcp/ip", "hadoop", "kafka", "rabbitmq",
    "btech", "b.tech", "mca", "bca", "computer science",
]

_JOB_TITLE_WEIGHT = 1.0
_EXP_YEAR_PROFILE = [
    (r"(?:^|\s)(20\d\d|19\d\d)\s*[-–—]\s*(?:present|now|current|today)\b", datetime.now().year),
    (r"(?:^|\s)(20\d\d|19\d\d)\s*[-–—]\s*(20\d\d|19\d\d)\b", None),
]


def extract_resume_text(filename: str, data: bytes) -> str:
    lower = filename.lower()
    text = ""
    if lower.endswith(".pdf"):
        text = _extract_pdf(data)
        if not text and not data.startswith(b"%PDF"):
            text = _decode_text(data)
    elif lower.endswith(".docx"):
        text = _extract_docx(data)
        if not text and not data.startswith(b"PK"):
            text = _decode_text(data)
    elif lower.endswith((".txt", ".md", ".text")):
        text = _decode_text(data)
    else:
        text = _extract_pdf(data) or _extract_docx(data) or _decode_text(data)
    return (text or "").replace("\x00", "")


INVOICE_BILL_PATTERNS = [
    # Invoices & Bills
    r"\btax\s+invoice\b",
    r"\bproforma\s+invoice\b",
    r"\bcommercial\s+invoice\b",
    r"\bbill\s+of\s+supply\b",
    r"\binvoice\s+(?:no|num|number|#|date|id)\b",
    r"\b(?:total\s+)?invoice\s+amount\b",
    r"\bbill\s+to\b",
    r"\bbilled\s+to\b",
    r"\bbilling\s+address\b",
    r"\bship\s+to\b",
    r"\bshipped\s+to\b",
    r"\bshipping\s+address\b",
    r"\bplace\s+of\s+supply\b",
    r"\bsub[\s-]?total\b",
    r"\bgrand\s+total\b",
    r"\btotal\s+amount\s+(?:due|payable)\b",
    r"\bamount\s+payable\b",
    r"\bbalance\s+due\b",
    r"\bnet\s+payable\b",
    r"\bround\s+off\b",
    r"\bunit\s+price\b",
    r"\brate\s+per\s+unit\b",
    r"\bitem\s+total\b",
    r"\bhsn[\s/]*(?:sac|code)?\b",
    r"\bgst(?:in)?\s*[:\s#]*[0-9a-z]{10,}\b",
    r"\bcgst\b",
    r"\bsgst\b",
    r"\bigst\b",
    r"\btaxable\s+value\b",
    r"\bmode\s+of\s+payment\b",
    r"\bpayment\s+method\b",
    r"\bauthorized\s+signatory\b",

    # Orders & Receipts
    r"\border\s+(?:summary|confirmation|number|#|id|placed)\b",
    r"\bpayment\s+(?:receipt|confirmation|summary|advice|successful)\b",
    r"\breceipt\s+(?:no|num|number|#|date)\b",
    r"\btransaction\s+(?:id|number|details|reference|ref)\b",
    r"\bsold\s+by\b",
    r"\btracking\s+(?:id|number)\b",
    r"\bshipment\s+details\b",
    r"\bdelivery\s+address\b",

    # Banking & Financial Statements
    r"\bstatement\s+of\s+account\b",
    r"\bbank\s+statement\b",
    r"\baccount\s+statement\b",
    r"\baccount\s+summary\b",
    r"\bopening\s+balance\b",
    r"\bclosing\s+balance\b",
    r"\bcredit\s+limit\b",
    r"\bavailable\s+limit\b",
    r"\bminimum\s+(?:amount\s+)?due\b",
    r"\bcredit\s+card\s+statement\b",
    r"\bstatement\s+period\b",
    r"\bpassbook\b",
    r"\bdemat\s+account\b",

    # Utilities & Recharges
    r"\belectricity\s+bill\b",
    r"\butility\s+bill\b",
    r"\bwater\s+bill\b",
    r"\bgas\s+bill\b",
    r"\bconsumer\s+(?:no|number|id)\b",
    r"\bmeter\s+number\b",
    r"\bunits\s+consumed\b",
    r"\bpower\s+distribution\b",
    r"\brecharge\s+successful\b",
    r"\bmobile\s+recharge\b",

    # Travel & Tickets
    r"\bflight\s+ticket\b",
    r"\bboarding\s+pass\b",
    r"\be-ticket\b",
    r"\bpnr(?:\s+no|\s+number)?\s*[:#\s]*[a-z0-9]{6,}\b",
    r"\bpassenger\s+(?:name|details)\b",
    r"\btrain\s+(?:no|number)\b",
    r"\bberth\s+preference\b",
    r"\bseat\s+number\b",

    # Payslips
    r"\bsalary\s+slip\b",
    r"\bpayslip\s+(?:for|of)\b",
    r"\bpay\s+slip\s+(?:for|of)\b",
    r"\bbasic\s+pay\b",
    r"\bdearness\s+allowance\b",
    r"\bprovident\s+fund\s+deduction\b",
    r"\bnet\s+salary\b",
    r"\bgross\s+salary\b",

    # Insurance
    r"\binsurance\s+policy\b",
    r"\bpolicy\s+schedule\b",
    r"\bpremium\s+receipt\b",
    r"\bsum\s+insured\b",

    # Certificates / Marksheets / IDs (Not resumes!)
    r"\bcertificate\s+of\s+(?:completion|appreciation|participation|excellence)\b",
    r"\bthis\s+is\s+to\s+certify\s+that\b",
    r"\bthis\s+certificate\s+is\s+(?:proudly\s+)?presented\s+to\b",
    r"\bstatement\s+of\s+marks\b",
    r"\bhall\s+ticket\b",
    r"\badmit\s+card\b",
    r"\baadhaar\s+card\b",
    r"\belection\s+commission\s+of\s+india\b",
    r"\bvoter\s+identity\s+card\b",
    r"\bdriving\s+licen[sc]e\b",
]

RESUME_SECTION_PATTERNS = [
    r"\b(?:work\s+)?experience\b",
    r"\bemployment(?:\s+history)?\b",
    r"\bcareer\s+summary\b",
    r"\bprofessional\s+summary\b",
    r"\bacademic\s+(?:background|history|qualifications?)\b",
    r"\beducation\b",
    r"\bqualifications?\b",
    r"\btechnical\s+skills\b",
    r"\bcore\s+competencies\b",
    r"\bkey\s+skills\b",
    r"\bskills?\b",
    r"\bprojects?\b",
    r"\bcurriculum\s+vitae\b",
    r"\bresume\b",
    r"\bbio-?data\b",
    r"\bcareer\s+objective\b",
    r"\bobjective\b",
    r"\bcertifications?\b",
    r"\binternships?\b",
    r"\bachievements?\b",
    r"\bprofile\b",
    r"\babout\s+me\b",
    r"\bdeclaration\b",
    r"\bpersonal\s+details\b",
    r"\blanguages?\b",
]


def is_valid_resume_content(
    text: str, filename: str, *, strict: bool = False
) -> tuple[bool, str]:
    """Inspect text and filename to verify the document is a genuine resume, not an invoice, bill, receipt, or random PDF."""
    if not text or len(text.strip()) < 20:
        return False, "Document text is empty or unreadable"

    lower = text.lower()
    lower_fn = (filename or "").lower()

    if strict:
        valid, reason = _validate_mailbox_resume(text)
        if not valid:
            return valid, reason

    # 1. Immediate rejection: check for explicit invoice / bill / statement patterns
    for pat in INVOICE_BILL_PATTERNS:
        if re.search(pat, lower):
            return False, "Matched invoice, billing, or statement marker"

    # 2. Secondary check: standalone invoice keyword combined with financial/billing attributes
    if re.search(r"\binvoices?\b", lower):
        if any(w in lower for w in ("total", "amount", "due", "balance", "subtotal", "payment", "paid", "bill to", "billed to", "tax", "gst", "item", "qty")):
            if not any(proj in lower for proj in ("project:", "projects", "work experience", "technical skills", "education")):
                return False, "Document appears to be an invoice"
            if any(w in lower for w in ("invoice no", "invoice #", "bill to", "billed to", "subtotal", "gstin", "grand total", "amount due", "balance due")):
                return False, "Document contains invoice billing table"

    # 3. Reject non-resume filenames
    bad_fn = ("invoice", "tax_invoice", "receipt", "statement", "ticket", "bill", "salaryslip", "payslip", "marksheet", "admitcard", "certificate")
    if any(b in lower_fn for b in bad_fn):
        return False, f"Filename indicates non-resume ({filename})"

    # 4. Check for explicit resume indicators in filename
    has_fn_marker = any(k in lower_fn for k in ("resume", "cv", "biodata", "curriculum"))

    # 5. Extract candidate contact info and signals
    has_email = bool(extract_email(text))
    has_phone = bool(extract_phone(text))
    has_link = bool(re.search(r"(?:linkedin\.com|github\.com|gitlab\.com|portfolio|behance\.net|medium\.com)", lower))
    has_contact = has_email or has_phone or has_link

    # 6. Count resume sections and skills
    sec_matches = [pat for pat in RESUME_SECTION_PATTERNS if re.search(pat, lower)]
    skills = extract_skills(text)

    # Decision tree:
    # A) File named explicitly as resume/cv with at least some section, skill, or contact info
    if has_fn_marker and (sec_matches or skills or has_contact):
        return True, "Filename indicates resume with supporting profile data"

    # B) Standard resume structure: contains multiple recognized sections and skills or contact info
    if len(sec_matches) >= 2 and (skills or has_contact):
        return True, "Standard resume sections and profile data found"

    # C) Has skills and professional context with candidate contact details
    if skills and (len(sec_matches) >= 1 or "developer" in lower or "engineer" in lower or "experience" in lower or len(skills) >= 2):
        if has_contact or len(sec_matches) >= 1:
            return True, "Resume skills and professional context found"

    # D) Multiple recognized technical skills and candidate contact details
    if len(skills) >= 2 and has_contact:
        return True, "Technical skills and candidate contact details found"

    return False, "Document lacks resume structure or professional skills"


def _validate_mailbox_resume(text: str) -> tuple[bool, str]:
    """Require a personal career document, independent of filename or email subject.

    Count distinct section families at line boundaries, not repeated keywords in
    prose. This keeps a cover letter mentioning skills/experience from qualifying.
    No technical skill vocabulary is required, so nontechnical CVs qualify too.
    """
    lower = text.lower()
    non_resume_patterns = (
        r"\bdear\s+(?:hiring\s+manager|recruiter|sir|madam|recruitment\s+team)\b",
        r"\bi\s+am\s+writing\s+to\s+(?:apply|express)\b",
        r"\bplease\s+find\s+(?:my\s+)?(?:attached|enclosed)\s+(?:resume|cv)\b",
        r"(?m)^\s*(?:cover(?:ing)?\s+letter|job\s+description|offer\s+letter|"
        r"appointment\s+letter|experience\s+letter|relieving\s+letter|"
        r"academic\s+transcript|statement\s+of\s+purpose)\b",
        r"\b(?:we\s+are\s+(?:looking\s+for|hiring)|the\s+ideal\s+candidate|"
        r"required\s+qualifications|key\s+responsibilities|this\s+certifies\s+that)\b",
    )
    if any(re.search(pattern, lower) for pattern in non_resume_patterns):
        return False, "Document is a supporting letter, job description, or certificate"

    families = (
        r"(?:(?:work|professional|relevant)\s+experience|experience|employment(?:\s+history)?|internships?)",
        r"(?:education(?:al\s+(?:background|qualifications?))?|academic\s+(?:background|history|qualifications?|details))",
        r"(?:(?:(?:technical|key|professional|core)\s+)?skills|core\s+competencies)",
        r"(?:(?:(?:personal|academic|selected|key)\s+)?projects)",
        r"(?:(?:professional|career|personal)\s+(?:summary|profile)|summary|career\s+objective|objective|about\s+me)",
    )
    sections = sum(
        bool(re.search(rf"(?m)^\s*(?:[•#*\-]\s*)?{family}\s*(?::|[|]|$)", lower))
        for family in families
    )
    contact = bool(extract_email(text) or extract_phone(text) or re.search(
        r"\b(?:linkedin\.com/in/|github\.com/|behance\.net/)", lower
    ))
    if sections < 2 or not contact:
        return False, "Attachment lacks distinct resume sections and personal contact details"
    return True, "Personal resume structure found"


def _decode_text(data: bytes) -> str:
    if not data:
        return ""
    try:
        return data.decode("utf-8", errors="replace").replace("\x00", "")
    except Exception:
        try:
            return data.decode("latin-1", errors="replace").replace("\x00", "")
        except Exception:
            return ""


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        return (text or "").replace("\x00", "")
    except Exception:
        return ""


def _extract_docx(data: bytes) -> str:
    try:
        from docx import Document

        doc = Document(io.BytesIO(data))
        parts = []
        for para in doc.paragraphs:
            if para.text.strip():
                parts.append(para.text.strip())
        for table in doc.tables:
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells]
                parts.append(" | ".join(cells))
        return "\n".join(parts)
    except Exception:
        return ""


def extract_skills(text: str) -> list[str]:
    lower = text.lower()
    found: list[str] = []
    for skill in SKILL_LEXICON:
        pattern = re.compile(rf"\b{re.escape(skill)}\b", re.IGNORECASE)
        if pattern.search(lower):
            if skill not in found:
                found.append(skill)
    return found


def extract_experience_years(text: str) -> int:
    years = 0.0
    # Covers common CV formats such as "May 2021 - Present" and
    # "06/2019 – 08/2023", where the old year-only expression was too strict.
    for m in re.finditer(
        r"\b(?:[A-Za-z]{3,9}\s+|\d{1,2}[/-])?(19\d{2}|20\d{2})\s*[-–—to]+\s*"
        r"(?:(?:[A-Za-z]{3,9}\s+|\d{1,2}[/-])?(19\d{2}|20\d{2})|present|current|now)\b",
        text,
        re.IGNORECASE,
    ):
        start = int(m.group(1))
        end = datetime.now().year if not m.group(2) else int(m.group(2))
        if 1970 <= start <= end <= datetime.now().year + 1:
            years = max(years, float(end - start))
    for pattern, end_year in _EXP_YEAR_PROFILE:
        for m in re.finditer(pattern, text):
            start = int(m.group(1))
            end = end_year if end_year else int(m.group(2))
            if start < end and 1970 <= start <= datetime.now().year:
                span = max(0.0, end - start)
                # Prefer the longest continuous span found.
                years = max(years, span)
    if years == 0.0:
        for m in re.finditer(r"(?:^|\s)(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b", text, re.IGNORECASE):
            years = max(years, float(m.group(1)))
    return int(round(years))


def extract_current_title(text: str) -> str | None:
    """Extract a likely professional title from the header or profile lines."""
    title_terms = re.compile(
        r"\b(?:developer|engineer|designer|manager|analyst|consultant|architect|"
        r"administrator|scientist|recruiter|specialist|coordinator|director|"
        r"accountant|nurse|teacher|intern|associate|executive|officer|lead)\b",
        re.IGNORECASE,
    )
    section_terms = re.compile(
        r"^(?:resume|curriculum vitae|profile|summary|objective|education|skills|"
        r"experience|projects|certifications?|contact|work experience)\s*:?$",
        re.IGNORECASE,
    )
    lines = [re.sub(r"\s+", " ", line).strip(" •|:-") for line in text.splitlines()]
    for line in lines[:18]:
        if not line or len(line) > 100 or section_terms.match(line):
            continue
        if "@" in line or re.search(r"\d{5,}", line) or re.search(r"https?://", line, re.I):
            continue
        if title_terms.search(line) and 1 <= len(line.split()) <= 8:
            return line
    match = re.search(
        r"\b((?:senior|junior|lead|principal|staff)?\s*(?:software\s+)?"
        r"(?:developer|engineer|designer|manager|analyst|consultant|architect|"
        r"administrator|scientist|recruiter|specialist|coordinator|director|"
        r"accountant|nurse|teacher|intern|associate|executive|officer))\b",
        text,
        re.IGNORECASE,
    )
    if match:
        return re.sub(r"\s+", " ", match.group(1)).strip().title()
    return None


def extract_email(text: str) -> str | None:
    m = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    return m.group(0).strip() if m else None


def extract_phone(text: str) -> str | None:
    m = re.search(
        r"(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}", text
    )
    return m.group(0).strip() if m else None


def guess_name(text: str) -> str | None:
    first_lines = [ln.strip() for ln in text.splitlines() if ln.strip()][:6]
    for ln in first_lines:
        if len(ln) <= 200 and all(c.isalpha() or c in ". '-–" for c in ln):
            words = [w for w in re.split(r"\s+", ln) if w]
            if 2 <= len(words) <= 4:
                return ln
    return None


KNOWN_LOCATIONS = [
    # India - Major Cities & Tech Hubs
    "bengaluru", "bangalore", "hyderabad", "secunderabad", "pune", "mumbai", "bombay",
    "delhi", "new delhi", "noida", "greater noida", "gurgaon", "gurugram", "chennai", "madras",
    "kolkata", "calcutta", "ahmedabad", "kochi", "cochin", "trivandrum", "thiruvananthapuram",
    "calicut", "kozhikode", "thrissur", "ernakulam", "coimbatore", "mysore", "mysuru",
    "mangalore", "mangaluru", "goa", "panaji", "chandigarh", "mohali", "jaipur", "indore",
    "bhopal", "lucknow", "kanpur", "patna", "bhubaneswar", "cuttack", "visakhapatnam", "vizag",
    "vijayawada", "guntur", "warangal", "tirupati", "nagpur", "nashik", "surat", "vadodara",
    "rajkot", "ranchi", "raipur", "dehradun", "guwahati", "shimla", "amritsar", "jalandhar",
    # India - States & Regions
    "karnataka", "maharashtra", "telangana", "andhra pradesh", "tamil nadu", "kerala",
    "gujarat", "uttar pradesh", "rajasthan", "punjab", "haryana", "west bengal", "odisha",
    "madhya pradesh", "bihar", "assam", "delhi ncr",
    # North America - Tech Hubs & Cities
    "san francisco", "san jose", "silicon valley", "bay area", "seattle", "bellevue", "redmond",
    "new york", "nyc", "brooklyn", "manhattan", "austin", "boston", "cambridge", "chicago",
    "denver", "boulder", "los angeles", "san diego", "sacramento", "atlanta", "dallas",
    "houston", "fort worth", "san antonio", "washington", "washington dc", "philadelphia",
    "pittsburgh", "phoenix", "salt lake city", "detroit", "minneapolis", "nashville",
    "miami", "tampa", "orlando", "charlotte", "raleigh", "durham", "portland",
    # Canada
    "toronto", "vancouver", "montreal", "ottawa", "calgary", "edmonton", "waterloo", "mississauga",
    "ontario", "british columbia", "quebec", "alberta",
    # Europe & UK
    "london", "manchester", "birmingham", "edinburgh", "dublin", "berlin", "munich",
    "frankfurt", "hamburg", "amsterdam", "rotterdam", "paris", "lyon", "madrid",
    "barcelona", "stockholm", "gothenburg", "zurich", "geneva", "warsaw", "krakow",
    "lisbon", "porto", "brussels", "vienna", "copenhagen", "oslo", "helsinki",
    "prague", "milan", "rome", "athens", "budapest", "bucharest",
    # APAC, Middle East & Oceania
    "singapore", "tokyo", "sydney", "melbourne", "brisbane", "perth", "adelaide",
    "auckland", "wellington", "dubai", "abu dhabi", "doha", "riyadh", "tel aviv",
    "hong kong", "seoul", "bangkok", "kuala lumpur", "jakarta", "manila",
    # Remote
    "remote", "hybrid", "work from home", "wfh",
]


def _format_location(loc_str: str) -> str:
    """Format location string into clean Title Case with standardized commas and state abbreviations."""
    loc_str = re.sub(r"^(?:current\s+)?location\s*[:\-]\s*", "", loc_str, flags=re.I).strip()
    loc_str = re.sub(r"\s+", " ", loc_str)
    parts = [p.strip() for p in loc_str.split(",") if p.strip()]
    formatted_parts = []
    for p in parts:
        if len(p) == 2 and p.isalpha():
            formatted_parts.append(p.upper())
        elif p.lower() in ("usa", "uk", "uae", "nyc", "wfh", "ncr"):
            formatted_parts.append(p.upper())
        else:
            formatted_parts.append(p.title())
    return ", ".join(formatted_parts)


def extract_location(text: str) -> str | None:
    """Extract candidate location from resume text with high recall across diverse resume layouts."""
    if not text:
        return None

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    header_lines = lines[:30]

    # 1. Look for explicit labels: "Location: ...", "Address: ...", "Current Location: ...", etc.
    label_pattern = re.compile(
        r"(?:^|\b)(?:current\s+location|preferred\s+location|location|address|residing\s+in|based\s+in|residence|city|place|living\s+in|native)\s*[:\-]\s*([^\n\r;|•]+)",
        re.IGNORECASE,
    )
    for line in header_lines:
        m = label_pattern.search(line)
        if m:
            val = m.group(1).strip()
            val = re.sub(r"(?:https?://\S+|www\.\S+|\S+@\S+|\b\d{10,}\b)", "", val)
            val = re.sub(r"\s+", " ", val).strip(" •|:-,")
            val = re.sub(r"\s*[-–—]?\s*\b\d{5,6}\b\s*$", "", val).strip()
            if 2 <= len(val) <= 60 and not re.search(r"@|\d{7,}", val):
                return _format_location(val)

    # 2. Inspect segmented tokens in header lines (e.g. "email | phone | Bengaluru, India | LinkedIn")
    for line in header_lines:
        segments = re.split(r"\s*[|•·;/\t]\s*|\s{3,}|\s+-\s+", line)
        for seg in segments:
            seg_clean = seg.strip(" •|:-,")
            if not seg_clean or len(seg_clean) > 60:
                continue
            if "@" in seg_clean or "http" in seg_clean or "linkedin" in seg_clean.lower() or "github" in seg_clean.lower():
                continue
            if re.search(r"^\+?\d[\d\s().-]{7,}\d$", seg_clean):
                continue
            if re.search(r"^(?:skills|education|experience|summary|projects|objective|technical)", seg_clean, re.IGNORECASE):
                continue

            seg_lower = seg_clean.lower()

            for loc in KNOWN_LOCATIONS:
                if re.search(rf"\b{re.escape(loc)}\b", seg_lower):
                    clean_res = re.sub(r"\s*[-–—]?\s*\b\d{5,6}\b\s*$", "", seg_clean).strip()
                    if len(clean_res) <= 50 and not re.search(r"@|\d{5,}", clean_res):
                        return _format_location(clean_res)
                    return loc.title()

            city_state_match = re.search(
                r"\b([A-Z][a-zA-Z\s.-]{2,25}),\s*([A-Z]{2}|India|USA|United States|UK|United Kingdom|Canada|Germany|Australia|Singapore|UAE|France|Netherlands|Ireland|Texas|California|Washington|New York|Karnataka|Maharashtra|Telangana|Tamil Nadu)\b",
                seg_clean,
            )
            if city_state_match:
                return f"{city_state_match.group(1).strip()}, {city_state_match.group(2).strip()}"

    # 3. Full-line City, State / Country check
    city_state_pat = re.compile(
        r"\b([A-Z][a-zA-Z\s.-]{2,25}),\s*([A-Z]{2}|India|USA|United States|UK|United Kingdom|Canada|Germany|Australia|Singapore|UAE|France|Netherlands|Ireland)\b"
    )
    for line in header_lines:
        if "@" in line and not any(loc in line.lower() for loc in KNOWN_LOCATIONS):
            continue
        m = city_state_pat.search(line)
        if m:
            return f"{m.group(1).strip()}, {m.group(2).strip()}"

    # 4. Standalone location mentions in top section
    for line in lines[:50]:
        line_lower = line.lower()
        if "location" in line_lower or "based in" in line_lower or "relocate" in line_lower:
            for loc in KNOWN_LOCATIONS:
                if re.search(rf"\b{re.escape(loc)}\b", line_lower):
                    return loc.title()

    return None


def extract_summary(
    text: str,
    title: str | None = None,
    exp_years: int | None = None,
    skills: list[str] | None = None,
) -> str | None:
    """Extract or intelligently compose a clean professional candidate summary.

    Avoids dumping raw phone numbers, emails, or chopped incomplete text.
    """
    if not text:
        return None

    # Step 1: Look for explicit summary header
    section_break = re.compile(
        r"(?im)^\s*(?:(?:work\s+)?experience|employment|technical\s+skills|skills|core\s+competencies|education|academic|projects|certifications?|awards?|achievements?)\s*[:\-\s]*$"
    )
    summary_header = re.compile(
        r"(?im)^\s*(?:professional\s+summary|career\s+summary|executive\s+summary|summary|profile|about\s+me|career\s+objective|objective)\s*[:\-\s]*$"
    )
    inline_header = re.compile(
        r"(?im)^\s*(?:professional\s+summary|career\s+summary|executive\s+summary|summary|profile|about\s+me|career\s+objective|objective)\s*[:\-]\s*(.+)$"
    )

    lines = [ln.strip() for ln in text.splitlines()]
    found_summary_lines: list[str] = []
    collecting = False

    for line in lines:
        if not collecting:
            inline_m = inline_header.match(line)
            if inline_m:
                collecting = True
                content = inline_m.group(1).strip()
                if content:
                    found_summary_lines.append(content)
                continue
            if summary_header.match(line):
                collecting = True
                continue
        else:
            if section_break.match(line):
                break
            if not line:
                if len(" ".join(found_summary_lines)) > 150:
                    break
                continue
            if "@" in line or re.search(r"https?://|www\.", line, re.I) or re.search(r"\+?\d{10,}", line):
                continue
            found_summary_lines.append(line)
            if len(" ".join(found_summary_lines)) >= 600:
                break

    extracted = " ".join(found_summary_lines).strip()
    extracted = re.sub(r"\s+", " ", extracted)

    if len(extracted) >= 40:
        return extracted[:1200]

    # Step 2: If no explicit summary section was found, synthesize a clean profile summary
    parts = []
    if title:
        exp_str = f"with {exp_years}+ years of experience" if exp_years and exp_years > 0 else "with professional experience"
        parts.append(f"{title} {exp_str}")
    elif exp_years and exp_years > 0:
        parts.append(f"Experienced professional with {exp_years}+ years of background")

    if skills:
        top_skills = [s.title() for s in skills[:6]]
        if len(top_skills) > 1:
            skill_text = ", ".join(top_skills[:-1]) + f" and {top_skills[-1]}"
        else:
            skill_text = top_skills[0]
        if parts:
            parts.append(f"specializing in {skill_text}.")
        else:
            parts.append(f"Professional specializing in {skill_text}.")
    elif parts:
        parts.append("with a strong background in software engineering and delivery.")

    if parts:
        synthesis = " ".join(parts)
        if not synthesis.endswith("."):
            synthesis += "."
        for l in lines[1:10]:
            l_clean = re.sub(r"\s+", " ", l).strip()
            if 30 <= len(l_clean) <= 200 and not any(w in l_clean.lower() for w in ["email", "phone", "@", "github", "linkedin", "http", "address"]):
                if not re.search(r"^[A-Z\s]{4,}$", l_clean):
                    synthesis += f" {l_clean}"
                    break
        return synthesis[:1000]

    top_clean = [
        l for l in lines[:15]
        if 20 <= len(l) <= 200
        and "@" not in l
        and not re.search(r"https?://|\d{7,}", l)
        and not re.search(r"^(?:resume|curriculum|skills|education)", l, re.I)
    ]
    if top_clean:
        return " ".join(top_clean[:3])[:800]

    return None


def detect_duplicate_key(candidate) -> tuple[str | None, str | None, str | None]:
    email = (candidate.email or "").strip().lower() or None
    phone = re.sub(r"[^\d]", "", candidate.phone or "") or None
    name = (candidate.name or "").strip().lower() or None
    return email, phone, name


def save_upload(
    org_id: int, candidate_id: int, filename: str, data: bytes, upload_dir: str
) -> str:
    import os

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    rel = f"org_{org_id}/cand_{candidate_id}_{uuid.uuid4().hex[:8]}.{ext}"

    # Try configured upload_dir first; on read-only environments (e.g. Vercel / AWS Lambda), fallback to /tmp/uploads
    candidates_dirs = [upload_dir]
    if "/tmp" not in upload_dir:
        candidates_dirs.append("/tmp/uploads")

    for target in candidates_dirs:
        try:
            full = f"{target}/{rel}"
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "wb") as fh:
                fh.write(data)
            return rel
        except OSError as err:
            print(f"Failed to write upload to {target}: {err}")

    return rel

