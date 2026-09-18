from __future__ import annotations

import hashlib
import re
import uuid
from collections.abc import Iterable
from io import BytesIO
from pathlib import Path
from typing import Any

from docx import Document
from pypdf import PdfReader

from .classifier import analyze_resume, is_candidate_resume
from .config import Settings
from .errors import AppError
from .models import RequestContext
from .repository import Repository, safe_file_name, utc_now

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
MIME_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}


class ResumeService:
    def __init__(self, settings: Settings, repository: Repository) -> None:
        self.settings = settings
        self.repository = repository

    def process(
        self,
        files: Iterable[dict[str, Any]],
        context: RequestContext,
        source: str,
        role: str,
        *,
        strict: bool = False,
    ) -> tuple[list[dict[str, Any]], list[dict[str, str]], int]:
        """
        Process uploaded or imported candidate documents.

        In strict mode (used by automated imports such as Gmail only candidate
        resumes are accepted; anything that fails resume recognition is rejected
        outright instead of being downgraded to 'needs_review'.
        """
        existing = self.repository.list_applications(context)
        created: list[dict[str, Any]] = []
        failures: list[dict[str, str]] = []
        skipped = 0

        for file in files:
            original_name = str(file.get("name") or "resume")
            content = file.get("content") or b""
            external_id = str(file.get("externalId") or "")
            storage_path = str(file.get("storagePath") or "")
            try:
                self._validate_file(original_name, content)
                if external_id and self.repository.has_external_id(context, external_id):
                    skipped += 1
                    continue

                mime_type = str(file.get("mimeType") or MIME_BY_EXTENSION[Path(original_name).suffix.lower()])
                checksum = hashlib.sha256(content).hexdigest()
                text = extract_resume_text(content, original_name)
                is_valid, reject_reason = is_candidate_resume(text, original_name)
                status = "new"
                if not is_valid:
                    if strict:
                        failures.append({"fileName": original_name, "message": reject_reason})
                        continue
                    status = "needs_review"
                    lower_text = text.lower()
                    strong_invalids = ("tax invoice", "commercial invoice", "boarding pass", "e-ticket")
                    if len(text.strip()) < 35 or any(si in lower_text for si in strong_invalids):
                        failures.append({"fileName": original_name, "message": reject_reason})
                        continue

                analysis = analyze_resume(text, original_name)
                duplicate = _find_duplicate(existing + created, analysis["email"], analysis["phone"], checksum)
                if duplicate:
                    if storage_path:
                        self.repository.delete_resume_objects([storage_path])
                    skipped += 1
                    failures.append({
                        "fileName": original_name,
                        "message": f"Candidate '{duplicate.get('candidateName', 'Candidate')}' ({duplicate.get('email') or 'duplicate file'}) is already indexed in your workspace.",
                    })
                    continue

                application_id = str(uuid.uuid4())
                object_path = storage_path or (
                    f"{context.organization_id}/{application_id}/{safe_file_name(original_name)}"
                )
                now = utc_now()
                application = {
                    **analysis,
                    "id": application_id,
                    "originalName": original_name,
                    "storedName": object_path,
                    "fileChecksum": checksum,
                    "sourceExternalId": external_id or None,
                    "mimeType": mime_type,
                    "fileSize": len(content),
                    "uploadedAt": now,
                    "updatedAt": now,
                    "source": _clean(source, "Direct upload", 180),
                    "role": _clean(role, "Open application", 180),
                    "status": "needs_review" if (status == "needs_review" or int(analysis["resumeTextLength"]) < 80) else "new",
                    "notes": "",
                    "tags": [],
                    "duplicateOf": None,
                }
                if not storage_path:
                    self.repository.upload_resume(object_path, content, mime_type)
                try:
                    saved = self.repository.insert_applications([application], context)[0]
                except Exception:
                    if external_id and self.repository.has_external_id(context, external_id):
                        skipped += 1
                        continue
                    self.repository.delete_resume_objects([object_path])
                    raise
                created.append(saved)
                self.repository.audit(context, "application.created", "application", application_id, {"source": source})
            except Exception as error:
                if storage_path:
                    self.repository.delete_resume_objects([storage_path])
                failures.append({"fileName": original_name, "message": _safe_error(error)})

        return created, failures, skipped

    def _validate_file(self, name: str, content: bytes) -> None:
        extension = Path(name).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise AppError("Only PDF, DOCX, and TXT resumes are supported.")
        if not content:
            raise AppError("The uploaded file is empty.")
        if len(content) > self.settings.max_upload_bytes:
            raise AppError("The resume exceeds the 14 MB file limit.")


def extract_resume_text(content: bytes, name: str) -> str:
    extension = Path(name).suffix.lower()
    if extension == ".pdf":
        reader = PdfReader(BytesIO(content), strict=False)
        if len(reader.pages) > 100:
            raise AppError("PDF exceeds the 100-page processing limit.")
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    if extension == ".docx":
        document = Document(BytesIO(content))
        paragraphs = [paragraph.text for paragraph in document.paragraphs]
        tables = [cell.text for table in document.tables for row in table.rows for cell in row.cells]
        return "\n".join(paragraphs + tables).strip()
    if extension == ".txt":
        for encoding in ("utf-8-sig", "utf-16", "latin-1"):
            try:
                return content.decode(encoding).strip()
            except UnicodeDecodeError:
                continue
    raise AppError("Could not read this resume file.")


def _find_duplicate(
    applications: list[dict[str, Any]], email: object, phone: object, checksum: str
) -> dict[str, Any] | None:
    normalized_email = str(email or "").strip().lower()
    raw_phone = re.sub(r"\D", "", str(phone or ""))
    normalized_phone = raw_phone[-10:] if len(raw_phone) >= 7 else ""
    clean_checksum = str(checksum or "").strip()

    for application in applications:
        app_email = str(application.get("email") or "").strip().lower()
        email_match = bool(normalized_email and app_email and app_email == normalized_email)

        app_raw_phone = re.sub(r"\D", "", str(application.get("phone") or ""))
        app_norm_phone = app_raw_phone[-10:] if len(app_raw_phone) >= 7 else ""
        phone_match = bool(normalized_phone and app_norm_phone and app_norm_phone == normalized_phone)

        app_checksum = str(application.get("fileChecksum") or "").strip()
        checksum_match = bool(clean_checksum and app_checksum and app_checksum == clean_checksum)

        if email_match or phone_match or checksum_match:
            return application
    return None


def _clean(value: str, fallback: str, maximum: int) -> str:
    return (value.strip() or fallback)[:maximum]


def _safe_error(error: Exception) -> str:
    if isinstance(error, AppError):
        return error.message
    return "The resume could not be processed."
