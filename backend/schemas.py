from __future__ import annotations

from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator

from backend.models import (
    CandidateStage,
    JobStatus,
    Role,
    SourceKind,
)


class BootstrapIn(BaseModel):
    email: EmailStr | None = None
    password: str | None = None
    name: str | None = None

    @field_validator("password")
    @classmethod
    def _passwords(cls, v):
        if v is not None and len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AcceptInviteIn(BaseModel):
    email: EmailStr
    token: str
    password: str = Field(min_length=8)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    role: Role


class UserUpdate(BaseModel):
    name: str | None = None
    role: Role | None = None
    status: str | None = None


class SeatRequestCreate(BaseModel):
    reason: str | None = None


class SeatRequestReview(BaseModel):
    approve: bool
    reason: str | None = None


class CompanyCreate(BaseModel):
    name: str
    email: EmailStr | None = None
    seat_limit: int = Field(default=10, ge=1, le=1000)
    plan: str | None = None
    feature_flags: dict | None = None


class CompanyAdminCreate(UserCreate):
    seat_limit: int | None = None
    plan: str | None = None


class JobIn(BaseModel):
    title: str = Field(min_length=1)
    client_name: str | None = None
    department: str | None = None
    location: str | None = None
    employment_type: str | None = None
    status: JobStatus = JobStatus.OPEN
    salary_range: str | None = None
    requirements: str | None = None
    skills: list[str] = []


class CandidateIn(BaseModel):
    name: str = Field(min_length=1)
    email: str | None = None
    phone: str | None = None
    current_title: str | None = None
    current_company: str | None = None
    location: str | None = None
    summary: str | None = None
    skills: list[str] = []
    experience_years: int | None = None
    source: SourceKind = SourceKind.MANUAL
    stage: CandidateStage = CandidateStage.NEW
    job_ids: list[int] = []


class CandidateStageUpdate(BaseModel):
    stage: CandidateStage


class CandidatePatch(BaseModel):
    job_ids: list[int] = []
    add_job_ids: list[int] = []
    remove_job_ids: list[int] = []
    location: str | None = None
    current_title: str | None = None
    current_company: str | None = None
    summary: str | None = None


class NoteIn(BaseModel):
    body: str = Field(min_length=1)


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str = "#2563eb"


class CandidateTagPatch(BaseModel):
    tag_ids: list[int] = []
    add_tag_ids: list[int] = []
    remove_tag_ids: list[int] = []


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class OrgStatusUpdate(BaseModel):
    status: str


class GenericMessage(BaseModel):
    message: str
    data: Any | None = None