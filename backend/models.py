from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, field_validator

APPLICATION_STATUSES = [
    "new",
    "needs_review",
    "shortlisted",
    "screening",
    "interview",
    "offer",
    "hired",
    "hold",
    "rejected",
]

ApplicationStatus = Literal[
    "new",
    "needs_review",
    "shortlisted",
    "screening",
    "interview",
    "offer",
    "hired",
    "hold",
    "rejected",
]


@dataclass(frozen=True, slots=True)
class RequestContext:
    user_id: str
    email: str
    organization_id: str
    role: str
    authenticated: bool


class ApplicationUpdate(BaseModel):
    status: ApplicationStatus | None = None
    primarySkill: str | None = Field(default=None, max_length=180)
    primarySkillKey: str | None = Field(default=None, max_length=180)
    location: str | None = Field(default=None, max_length=180)
    city: str | None = Field(default=None, max_length=180)
    region: str | None = Field(default=None, max_length=180)
    country: str | None = Field(default=None, max_length=180)
    notes: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = None
    role: str | None = Field(default=None, max_length=180)
    source: str | None = Field(default=None, max_length=180)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = list(dict.fromkeys(tag.strip()[:80] for tag in value if tag.strip()))
        return cleaned[:12]

    def database_changes(self) -> dict[str, object]:
        mapping = {
            "primarySkill": "primary_skill",
            "primarySkillKey": "primary_skill_key",
        }
        values = self.model_dump(exclude_none=True)
        return {mapping.get(key, key): value for key, value in values.items()}


class BulkUpdateRequest(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)
    updates: ApplicationUpdate


class BulkDeleteRequest(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class JobCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    department: str = Field(default="", max_length=180)
    location: str = Field(default="", max_length=180)
    description: str = Field(default="", max_length=10000)


class CampaignCreateRequest(BaseModel):
    jobId: str | None = None
    title: str = Field(min_length=1, max_length=180)
    subject: str = Field(min_length=1, max_length=240)
    body: str = Field(min_length=1, max_length=50000)
    applicationIds: list[str] | None = Field(default=None, min_length=1, max_length=500)


class GmailImportRequest(BaseModel):
    query: str = Field(
        default="has:attachment (filename:pdf OR filename:docx OR filename:txt) newer_than:30d", max_length=500
    )
    role: str = Field(default="Open application", max_length=180)
    maxResults: int = Field(default=25, ge=1, le=50)


class TeamInviteRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    role: Literal["admin", "recruiter", "viewer"] = "recruiter"

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
            raise ValueError("Enter a valid email address")
        return cleaned


class UploadFileDescriptor(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    size: int = Field(gt=0, le=14 * 1024 * 1024)
    mimeType: str = Field(default="", max_length=180)


class UploadSignRequest(BaseModel):
    files: list[UploadFileDescriptor] = Field(min_length=1, max_length=100)


class UploadCompleteRequest(BaseModel):
    completionToken: str = Field(min_length=40, max_length=100000)
    role: str = Field(default="Open application", max_length=180)
    source: str = Field(default="Direct upload", max_length=180)


class NaturalSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)


class RediscoveryRequest(BaseModel):
    jobId: str | None = None
    query: str | None = None
    minScore: int = Field(default=60, ge=0, le=100)


class CandidateCompareRequest(BaseModel):
    candidateIds: list[str] = Field(min_length=2, max_length=5)
    jobId: str | None = None


class TalentPoolCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=1000)


class TalentPoolAddRequest(BaseModel):
    candidateIds: list[str] = Field(min_length=1, max_length=500)


class CopilotChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    activeCandidateId: str | None = None
    activeJobId: str | None = None


class CandidateMergeRequest(BaseModel):
    primaryCandidateId: str
    secondaryCandidateId: str


class BlindRevealRequest(BaseModel):
    candidateId: str
    reason: str = Field(default="Interview evaluation", max_length=250)


class CandidateUpdateRequest(BaseModel):
    canonicalName: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    currentTitle: str | None = None
    profileSummary: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    status: ApplicationStatus | None = None

