from __future__ import annotations

import enum
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import relationship

from backend.db import Base


def utcnow() -> datetime:
    """Naive UTC timestamp.

    SQLite strips tzinfo on read, so we store naive UTC everywhere to keep
    comparisons consistent regardless of backend.
    """
    return datetime.now(UTC).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class OrgStatus(str, enum.Enum):
    CREATED = "CREATED"
    INVITATION_SENT = "INVITATION_SENT"
    ACTIVATED = "ACTIVATED"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DEACTIVATED = "DEACTIVATED"


class UserStatus(str, enum.Enum):
    INVITED = "INVITED"
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"
    REACTIVATED = "REACTIVATED"


class Role(str, enum.Enum):
    MASTER_ADMIN = "MASTER_ADMIN"
    COMPANY_OWNER = "COMPANY_OWNER"
    COMPANY_ADMIN = "COMPANY_ADMIN"
    RECRUITER = "RECRUITER"
    HIRING_MANAGER = "HIRING_MANAGER"
    INTERVIEWER = "INTERVIEWER"
    READ_ONLY = "READ_ONLY"


class SeatRequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class JobStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    ON_HOLD = "ON_HOLD"


class CandidateStage(str, enum.Enum):
    NEW = "NEW"
    PARSED = "PARSED"
    IN_REVIEW = "IN_REVIEW"
    SHORTLISTED = "SHORTLISTED"
    INTERVIEW = "INTERVIEW"
    OFFER = "OFFER"
    ONBOARDING = "ONBOARDING"
    PLACED = "PLACED"
    REJECTED = "REJECTED"


class SourceKind(str, enum.Enum):
    UPLOAD = "UPLOAD"
    GMAIL = "GMAIL"
    IMPORT = "IMPORT"
    MANUAL = "MANUAL"


# ---------------------------------------------------------------------------
# Platform / tenant tables
# ---------------------------------------------------------------------------

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(200), unique=True, nullable=False)
    email = Column(String(255), nullable=True)
    status = Column(Enum(OrgStatus), default=OrgStatus.CREATED, nullable=False)
    seat_limit = Column(Integer, default=10, nullable=False)
    plan_code = Column(String(40), default="starter", nullable=False)
    feature_flags = Column(JSON, default=dict)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    users = relationship("User", back_populates="organization")
    jobs = relationship("Job", back_populates="organization", cascade="all, delete-orphan")
    candidates = relationship("Candidate", back_populates="organization", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="organization")


class SeatRequest(Base):
    __tablename__ = "seat_requests"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    current_seats = Column(Integer, nullable=False)
    requested_seats = Column(Integer, nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(Enum(SeatRequestStatus), default=SeatRequestStatus.PENDING, nullable=False)
    requested_by_user_id = Column(Integer, nullable=True)
    reviewed_by_user_id = Column(Integer, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    password_hash = Column(String(255), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    role = Column(Enum(Role), default=Role.READ_ONLY, nullable=False)
    status = Column(Enum(UserStatus), default=UserStatus.ACTIVE, nullable=False)
    invite_token_hash = Column(String(255), nullable=True)
    invite_expires_at = Column(DateTime, nullable=True)
    must_change_password = Column(Boolean, default=False, nullable=False)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="users")
    notes = relationship("Note", back_populates="author")

    @property
    def scope(self) -> str:
        return "platform" if self.role == Role.MASTER_ADMIN else "company"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    actor_user_id = Column(Integer, nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    action = Column(String(120), nullable=False, index=True)
    resource_type = Column(String(60), nullable=True)
    resource_id = Column(Integer, nullable=True)
    details = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)

    organization = relationship("Organization")


# ---------------------------------------------------------------------------
# Recruitment tables
# ---------------------------------------------------------------------------

candidate_tags = Table(
    "candidate_tags",
    Base.metadata,
    Column("candidate_id", Integer, ForeignKey("candidates.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_org_status", "organization_id", "status"),)

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    client_name = Column(String(200), nullable=True)
    department = Column(String(120), nullable=True)
    location = Column(String(200), nullable=True)
    employment_type = Column(String(60), nullable=True)
    status = Column(Enum(JobStatus), default=JobStatus.OPEN, nullable=False)
    salary_range = Column(String(120), nullable=True)
    requirements = Column(Text, nullable=True)
    skills = Column(JSON, default=list)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="jobs")


class Candidate(Base):
    __tablename__ = "candidates"
    __table_args__ = (
        Index("ix_candidates_org_stage", "organization_id", "stage"),
        Index("ix_candidates_org_email", "organization_id", "email"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=True)
    phone = Column(String(60), nullable=True)
    current_title = Column(String(200), nullable=True)
    current_company = Column(String(200), nullable=True)
    location = Column(String(200), nullable=True)
    summary = Column(Text, nullable=True)
    skills = Column(JSON, default=list)
    experience_years = Column(Integer, default=0, nullable=False)
    education = Column(JSON, default=list)
    resume_path = Column(String(500), nullable=True)
    resume_filename = Column(String(300), nullable=True)
    resume_text = Column(Text, nullable=True)
    source = Column(Enum(SourceKind), default=SourceKind.MANUAL, nullable=False)
    stage = Column(Enum(CandidateStage), default=CandidateStage.NEW, nullable=False)
    duplicate_of_id = Column(Integer, nullable=True)
    matched_job_ids = Column(JSON, default=list)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="candidates")
    notes = relationship("Note", back_populates="candidate", cascade="all, delete-orphan")
    tags = relationship("Tag", secondary=candidate_tags, back_populates="candidates")


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    author_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    author = relationship("User")
    candidate = relationship("Candidate", back_populates="notes")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    color = Column(String(20), default="#2563eb", nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    candidates = relationship("Candidate", secondary=candidate_tags, back_populates="tags")


# ===========================================================================
# Phase 3 — Intelligence
# ===========================================================================

class TalentPool(Base):
    __tablename__ = "talent_pools"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_shared = Column(Boolean, default=False, nullable=False)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    members = relationship(
        "TalentPoolMember", back_populates="pool", cascade="all, delete-orphan"
    )


class TalentPoolMember(Base):
    __tablename__ = "talent_pool_members"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    pool_id = Column(Integer, ForeignKey("talent_pools.id", ondelete="CASCADE"), nullable=False, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    added_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    pool = relationship("TalentPool", back_populates="members")


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    criteria = Column(JSON, default=dict)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


# ===========================================================================
# Phase 4 — Operations
# ===========================================================================

class InterviewStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"


class InterviewMode(str, enum.Enum):
    VIDEO = "VIDEO"
    ONSITE = "ONSITE"
    PHONE = "PHONE"


class OfferStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SENT = "SENT"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"
    WITHDRAWN = "WITHDRAWN"


class OnboardingStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(200), nullable=True)
    scheduled_at = Column(DateTime, nullable=True, index=True)
    duration_minutes = Column(Integer, default=60, nullable=False)
    mode = Column(Enum(InterviewMode), default=InterviewMode.VIDEO, nullable=False)
    location = Column(String(300), nullable=True)
    status = Column(Enum(InterviewStatus), default=InterviewStatus.SCHEDULED, nullable=False)
    interviewer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    scorecards = relationship(
        "Scorecard", back_populates="interview", cascade="all, delete-orphan"
    )


class Scorecard(Base):
    __tablename__ = "scorecards"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, index=True)
    interviewer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    technical = Column(Integer, nullable=True)
    communication = Column(Integer, nullable=True)
    culture_fit = Column(Integer, nullable=True)
    overall = Column(Integer, nullable=True)
    recommendation = Column(String(40), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    interview = relationship("Interview", back_populates="scorecards")


class Offer(Base):
    __tablename__ = "offers"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    salary = Column(Integer, nullable=True)
    currency = Column(String(10), default="USD", nullable=False)
    employment_type = Column(String(60), nullable=True)
    start_date = Column(DateTime, nullable=True)
    status = Column(Enum(OfferStatus), default=OfferStatus.DRAFT, nullable=False)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class OnboardingTask(Base):
    __tablename__ = "onboarding_tasks"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    status = Column(Enum(OnboardingStatus), default=OnboardingStatus.PENDING, nullable=False)
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class EmailAccount(Base):
    __tablename__ = "email_accounts"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    provider = Column(String(30), default="gmail", nullable=False)
    email = Column(String(255), nullable=True)
    encrypted_access_token = Column(Text, nullable=True)
    encrypted_refresh_token = Column(Text, nullable=True)
    token_expiry = Column(DateTime, nullable=True)
    history_id = Column(String(64), nullable=True)
    status = Column(String(30), default="CONNECTED", nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    connected_by_user_id = Column(Integer, nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    last_sync_summary = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    subject = Column(String(300), nullable=False)
    body = Column(Text, nullable=False)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class EmailMessage(Base):
    __tablename__ = "email_messages"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="SET NULL"), nullable=True, index=True)
    template_id = Column(Integer, ForeignKey("email_templates.id", ondelete="SET NULL"), nullable=True)
    to_email = Column(String(255), nullable=False)
    subject = Column(String(300), nullable=False)
    body = Column(Text, nullable=False)
    status = Column(String(20), default="QUEUED", nullable=False)
    provider = Column(String(20), default="MOCK", nullable=False)
    error = Column(Text, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


# ===========================================================================
# Phase 5 — SaaS
# ===========================================================================

class SubscriptionStatus(str, enum.Enum):
    TRIALING = "TRIALING"
    ACTIVE = "ACTIVE"
    PAST_DUE = "PAST_DUE"
    CANCELLED = "CANCELLED"


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    plan_code = Column(String(40), nullable=False)
    status = Column(Enum(SubscriptionStatus), default=SubscriptionStatus.ACTIVE, nullable=False)
    seats = Column(Integer, default=10, nullable=False)
    current_period_start = Column(DateTime, default=utcnow, nullable=False)
    current_period_end = Column(DateTime, nullable=True)
    cancel_at_period_end = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class UsageCounter(Base):
    __tablename__ = "usage_counters"
    __table_args__ = (Index("ix_usage_org_metric_period", "organization_id", "metric", "period", unique=True),)

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    metric = Column(String(60), nullable=False)
    period = Column(String(7), nullable=False)  # YYYY-MM
    value = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    number = Column(String(40), nullable=False, unique=True)
    amount_cents = Column(Integer, default=0, nullable=False)
    currency = Column(String(10), default="USD", nullable=False)
    status = Column(String(20), default="OPEN", nullable=False)
    lines = Column(JSON, default=list)
    period = Column(String(7), nullable=False)
    issued_at = Column(DateTime, default=utcnow, nullable=False)
    due_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)


class ClientPortalToken(Base):
    __tablename__ = "client_portal_tokens"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    client_name = Column(String(200), nullable=False)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    job_ids = Column(JSON, default=list)
    can_view_candidates = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    last_viewed_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)