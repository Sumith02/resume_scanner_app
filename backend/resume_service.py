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
    "docker", "kubernetes", "k8s", "terraform", "ansible", "aws", "gcp",
    "azure", "linux", "git", "ci/cd", "jenkins", "github actions", "graphql",
    "rest api", "grpc", "websockets", "microservices", "serverless",
    "machine learning", "ml", "deep learning", "nlp", "natural language processing",
    "computer vision", "pandas", "numpy", "tensorflow", "pytorch", "scikit-learn",
    "data science", "data analysis", "etl", "spark", "airflow", "databricks",
    "tableau", "power bi", "looker", "excel",
    "product management", "product management", "agile", "scrum", "kanban",
    "jira", "confluence", "figma", "sketch", "design", "ui/ux", "ux design",
    "ui design", "prototyping", "user research",
    "salesforce", "hubspot", "marketing", "seo", "content marketing",
    "crm", "saas", "fintech", "e-commerce", "ecommerce",
    "leadership", "team leadership", "project management", "stakeholder management",
    "communication", "go-to-market", "gtm", "account management",
    "recruitment", "talent acquisition", "sourcing", "ats", "boolean search",
    "linkedin", "hiring", "staffing", "hr", "human resources", "payroll",
    "excel", "powerpoint", "word",
    "bash", "shell", "powershell", "api", "oauth", "jwt", "security",
    "cybersecurity", "penetration testing", "soc", "devops", "sre",
    "networking", "tcp/ip", "hadoop", "kafka", "rabbitmq", "numpy",
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


def _decode_text(data: bytes) -> str:
    if not data or b"\x00" in data:
        return ""
    try:
        return data.decode("utf-8").replace("\x00", "")
    except UnicodeDecodeError:
        try:
            return data.decode("latin-1").replace("\x00", "")
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


def detect_duplicate_key(candidate) -> tuple[str | None, str | None, str | None]:
    email = (candidate.email or "").strip().lower() or None
    phone = re.sub(r"[^\d]", "", candidate.phone or "") or None
    name = (candidate.name or "").strip().lower() or None
    return email, phone, name


def save_upload(
    org_id: int, candidate_id: int, filename: str, data: bytes, upload_dir: str
) -> str:

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    rel = f"org_{org_id}/cand_{candidate_id}_{uuid.uuid4().hex[:8]}.{ext}"
    full = f"{upload_dir}/{rel}"
    import os

    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as fh:
        fh.write(data)
    return rel