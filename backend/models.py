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
    must_change_password: bool = False


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
    applicationIds: list[str] | None = Field(default=None, max_length=500)
    customRecipients: list[dict[str, str]] | None = None


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


class ProvisionUserRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    fullName: str = Field(default="", max_length=180)
    role: Literal["admin", "recruiter", "hiring_manager", "viewer"] = "recruiter"
    temporaryPassword: str | None = Field(default=None, max_length=64)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
            raise ValueError("Enter a valid email address")
        return cleaned


class MasterBootstrapRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned != "sumithsbhatt@gmail.com":
            raise ValueError("Only the designated master administrator can be bootstrapped.")
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
    query: str = Field(default="", max_length=1000)


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


class InterviewCreateRequest(BaseModel):
    candidateId: str
    jobId: str | None = None
    title: str = Field(default="Technical Interview", max_length=180)
    interviewType: Literal["screening", "technical", "system_design", "cultural", "executive"] = "technical"
    interviewerName: str = Field(default="", max_length=180)
    scheduledAt: str = Field(default="", max_length=60)
    meetingLink: str = Field(default="", max_length=500)
    notes: str = Field(default="", max_length=2000)


class ScorecardSubmitRequest(BaseModel):
    interviewPlanId: str
    candidateId: str
    interviewerName: str = Field(default="", max_length=180)
    technicalRating: int = Field(default=3, ge=1, le=5)
    communicationRating: int = Field(default=3, ge=1, le=5)
    problemSolvingRating: int = Field(default=3, ge=1, le=5)
    cultureFitRating: int = Field(default=3, ge=1, le=5)
    overallRecommendation: Literal["strong_hire", "hire", "neutral", "no_hire", "strong_no_hire"] = "hire"
    strengths: str = Field(default="", max_length=2000)
    concerns: str = Field(default="", max_length=2000)
    detailedFeedback: str = Field(default="", max_length=10000)


class PipelineMoveRequest(BaseModel):
    candidateId: str
    toStage: ApplicationStatus
    jobId: str | None = None
    reason: str = Field(default="", max_length=500)


class OfferCreateRequest(BaseModel):
    candidateId: str
    jobId: str | None = None
    baseSalary: float = Field(ge=0)
    currency: str = Field(default="INR", max_length=10)
    bonus: float = Field(default=0, ge=0)
    equity: str = Field(default="", max_length=120)
    joiningDate: str = Field(default="", max_length=60)
    expirationDate: str = Field(default="", max_length=60)


class OfferStatusUpdateRequest(BaseModel):
    status: Literal["draft", "pending_approval", "sent", "accepted", "declined", "revoked"]


class OnboardingUpdateRequest(BaseModel):
    backgroundCheckStatus: Literal["pending", "passed", "flagged"] | None = None
    documentsVerified: bool | None = None
    equipmentProvisioned: bool | None = None
    startDate: str | None = None
    buddyAssigned: str | None = None
    status: Literal["in_progress", "completed"] | None = None


class RecruiterFeedbackRequest(BaseModel):
    candidateId: str
    jobId: str
    overrideScore: int = Field(ge=0, le=100)
    feedbackCategory: Literal["skill_accuracy", "experience_relevance", "false_positive", "false_negative", "general"] = "general"
    comments: str = Field(default="", max_length=2000)


class AgencyClientCreateRequest(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=180)
    industry: str = Field(default="Technology", max_length=180)
    tier: Literal["Enterprise Retained", "Exclusive Search", "High-Volume Contingency", "Standard"] = "Standard"
    slaHours: int = Field(default=24, ge=1, le=168)
    primaryRecruiter: str = Field(default="", max_length=180)


class ClientJobCreateRequest(BaseModel):
    clientId: str
    title: str = Field(min_length=1, max_length=180)
    department: str = Field(default="", max_length=180)
    targetHires: int = Field(default=1, ge=1, le=500)
    feePercentage: float = Field(default=15.0, ge=0, le=100)


class ShortlistShareRequest(BaseModel):
    clientId: str
    candidateId: str
    jobId: str | None = None


class ClientFeedbackRequest(BaseModel):
    shortlistId: str
    status: Literal["pending_review", "accepted", "rejected", "interview_requested"]
    feedback: str = Field(default="", max_length=2000)


class PlacementRecordRequest(BaseModel):
    clientId: str
    candidateId: str
    jobId: str | None = None
    placedDate: str = Field(default="", max_length=60)
    baseSalary: float = Field(ge=0)
    placementFee: float = Field(ge=0)
    guaranteeDays: int = Field(default=90, ge=0, le=365)


class InvoiceCreateRequest(BaseModel):
    clientId: str
    invoiceNumber: str = Field(min_length=1, max_length=60)
    amount: float = Field(gt=0)
    currency: str = Field(default="INR", max_length=10)
    dueDate: str = Field(default="", max_length=60)


class ComplianceExportRequest(BaseModel):
    exportType: Literal["candidates_full", "audit_logs", "compliance_dump"] = "candidates_full"
    format: Literal["json", "csv"] = "json"


class ComplianceDeleteRequest(BaseModel):
    candidateId: str
    reason: str = Field(default="Candidate GDPR/DPDP Right to be Forgotten", max_length=500)


class RetentionPolicyRequest(BaseModel):
    policyName: str = Field(min_length=1, max_length=180)
    dataType: Literal["resumes", "audit_logs", "rejected_candidates"] = "resumes"
    retentionDays: int = Field(default=730, ge=30, le=3650)
    action: Literal["delete", "anonymize", "archive"] = "anonymize"
    isActive: bool = True


