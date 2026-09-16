from __future__ import annotations

import csv
import io
import logging
import secrets
import string
import uuid
from collections import Counter
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, File, Form, Header, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from .auth import AuthService, require_role
from .classifier import SKILL_CATEGORIES
from .config import Settings, get_settings
from .client_service import agency_client_service
from .copilot_engine import process_copilot_message
from .crypto import SignedState
from .email_service import EmailService
from .errors import AppError, ServiceUnavailableError
from .gmail_service import GmailService
from .graph_engine import build_candidate_talent_graph, build_talent_network_overview
from .match_engine import compute_multidimensional_match, parse_job_requirements
from .models import (
    APPLICATION_STATUSES,
    ApplicationUpdate,
    BlindRevealRequest,
    BulkDeleteRequest,
    BulkUpdateRequest,
    CampaignCreateRequest,
    CandidateCompareRequest,
    CandidateMergeRequest,
    CandidateUpdateRequest,
    CopilotChatRequest,
    GmailImportRequest,
    JobCreateRequest,
    MasterBootstrapRequest,
    NaturalSearchRequest,
    ProvisionUserRequest,
    RediscoveryRequest,
    RequestContext,
    TalentPoolAddRequest,
    TalentPoolCreateRequest,
    TeamInviteRequest,
    UploadCompleteRequest,
    UploadSignRequest,
)
from .rediscovery_engine import rediscover_candidates_for_job
from .repository import Repository, build_repository, safe_file_name, utc_now
from .resume_service import ResumeService
from .search_engine import execute_hybrid_search, parse_natural_language_query
from .talent_engine import extract_candidate_intelligence

logger = logging.getLogger("nexerra")


class Services:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.error: AppError | None = None
        self.repository: Repository | None = None
        self.auth: AuthService | None = None
        self.resumes: ResumeService | None = None
        self.gmail: GmailService | None = None
        self.email: EmailService | None = None
        self.upload_state = SignedState(settings.oauth_state_secret, max_age_seconds=2 * 60 * 60)
        try:
            self.repository = build_repository(settings)
            self.auth = AuthService(settings, self.repository)
            self.resumes = ResumeService(settings, self.repository)
            self.gmail = GmailService(settings, self.repository, self.resumes)
            self.email = EmailService(settings)
        except AppError as error:
            self.error = error

    def require(self) -> tuple[Repository, AuthService, ResumeService, GmailService, EmailService]:
        if self.error:
            raise self.error
        if not all((self.repository, self.auth, self.resumes, self.gmail, self.email)):
            raise ServiceUnavailableError("The application services are unavailable.")
        return self.repository, self.auth, self.resumes, self.gmail, self.email


settings = get_settings()
services = Services(settings)
app = FastAPI(
    title="Nexerra Talent OS API",
    version="11.0.0",
    docs_url="/api/docs" if not settings.production else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if not settings.production else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(
        dict.fromkeys(
            [settings.app_origin] + ([] if settings.production else ["http://localhost:5173"])
        )
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = (
        "no-store"
        if request.url.path.startswith("/api/")
        else response.headers.get("Cache-Control", "public, max-age=0, must-revalidate")
    )
    return response


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, error: AppError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content={"message": error.message, "code": error.code})


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, error: Exception) -> JSONResponse:
    request_id = request.headers.get("x-request-id", "unknown")
    logger.exception("Unhandled API error request_id=%s", request_id, exc_info=error)
    return JSONResponse(
        status_code=500, content={"message": "An unexpected server error occurred.", "code": "internal_error"}
    )


def current_context(authorization: Annotated[str | None, Header()] = None) -> RequestContext:
    _, auth, _, _, _ = services.require()
    return auth.authenticate(authorization)


Context = Annotated[RequestContext, Depends(current_context)]


def _validated_resume_name(name: str) -> str:
    extension = Path(name).suffix.lower()
    if extension not in {".pdf", ".docx", ".txt"}:
        raise AppError("Only PDF, DOCX, and TXT resumes are supported.")
    return safe_file_name(name)


@app.get("/api/health")
def health() -> dict[str, object]:
    runtime_errors = settings.validate_runtime()
    if services.error:
        runtime_errors.append(services.error.message)
    infrastructure = (
        services.repository.readiness_checks()
        if services.repository
        else {"database": False, "schema": False, "storage": False}
    )
    database_reachable = infrastructure["database"]
    schema_ready = infrastructure["schema"]
    storage_reachable = infrastructure["storage"]
    if settings.supabase_configured and not database_reachable:
        runtime_errors.append("The production database is unavailable")
    elif settings.supabase_configured and not schema_ready:
        runtime_errors.append("The production database migrations are incomplete")
    if settings.supabase_configured and not storage_reachable:
        runtime_errors.append("The private resume storage bucket is unavailable")
    return {
        "ok": not runtime_errors,
        "status": "healthy" if not runtime_errors else "degraded",
        "service": "nexerra-talent-os-api",
        "version": "11.0.0",
        "environment": settings.environment,
        "checks": {
            "databaseConfigured": settings.supabase_configured,
            "databaseReachable": database_reachable,
            "schemaReady": schema_ready,
            "storageReachable": storage_reachable,
            "authenticationRequired": settings.auth_required,
            "gmailConfigured": settings.gmail_configured,
            "emailConfigured": settings.email_configured,
            "demoMode": settings.allow_demo_mode,
        },
        "errors": runtime_errors,
    }


@app.get("/api/me")
def me(context: Context) -> dict[str, object]:
    is_master = context.email.strip().lower() == "sumithsbhatt@gmail.com"
    return {
        "user": {
            "id": context.user_id,
            "email": context.email,
            "mustChangePassword": False if is_master else context.must_change_password,
        },
        "workspace": {"id": context.organization_id, "role": "owner" if is_master else context.role},
    }


@app.get("/api/taxonomy")
def taxonomy() -> dict[str, object]:
    categories = [
        {key: value for key, value in category.items() if key != "keywords"}
        | {"keywordCount": len(category["keywords"])}
        for category in SKILL_CATEGORIES
    ]
    return {"skillCategories": categories, "statuses": APPLICATION_STATUSES}


@app.get("/api/applications")
def list_applications(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    return {"applications": repository.list_applications(context)}


@app.post("/api/uploads/sign")
def sign_resume_uploads(payload: UploadSignRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    if not settings.supabase_configured:
        raise AppError("Signed uploads require production storage.", 409, "production_storage_required")
    if len(payload.files) > settings.max_upload_files:
        raise AppError(
            f"Upload no more than {settings.max_upload_files} resumes in one batch.",
            413,
            "too_many_files",
        )
    descriptors: list[dict[str, object]] = []
    uploads: list[dict[str, object]] = []
    for file in payload.files:
        safe_name = _validated_resume_name(file.name)
        path = f"{context.organization_id}/pending/{uuid.uuid4()}/{safe_name}"
        signed = repository.create_signed_upload(path)
        descriptor = {"path": path, "name": file.name, "size": file.size, "mimeType": file.mimeType}
        descriptors.append(descriptor)
        uploads.append(
            {
                **descriptor,
                "token": signed["token"],
                "signedUrl": signed.get("signed_url") or signed.get("signedUrl"),
            }
        )
    completion_token = services.upload_state.create(
        {"organizationId": context.organization_id, "userId": context.user_id, "files": descriptors}
    )
    return {"uploads": uploads, "completionToken": completion_token}


@app.post("/api/uploads/process", status_code=201)
def process_signed_uploads(payload: UploadCompleteRequest, context: Context) -> dict[str, object]:
    repository, _, resume_service, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    signed = services.upload_state.verify(payload.completionToken)
    if signed.get("organizationId") != context.organization_id or signed.get("userId") != context.user_id:
        raise AppError("This upload does not belong to your workspace.", 403, "upload_access_denied")
    descriptors = signed.get("files")
    if not isinstance(descriptors, list):
        raise AppError("The upload manifest is invalid.", 400, "invalid_upload_manifest")
    failures: list[dict[str, str]] = []

    def uploaded_files():
        for descriptor in descriptors:
            if not isinstance(descriptor, dict):
                continue
            path = str(descriptor.get("path") or "")
            name = str(descriptor.get("name") or "resume")
            if not path.startswith(f"{context.organization_id}/pending/"):
                failures.append({"fileName": name, "message": "The upload path is invalid."})
                continue
            try:
                content = repository.download_resume(path)
                if len(content) != int(descriptor.get("size") or 0):
                    raise AppError("The uploaded file size does not match the signed manifest.")
                yield {
                    "name": name,
                    "content": content,
                    "mimeType": str(descriptor.get("mimeType") or ""),
                    "storagePath": path,
                    "externalId": f"upload:{path}",
                }
            except Exception as error:
                repository.delete_resume_objects([path])
                message = error.message if isinstance(error, AppError) else "Upload could not be read."
                failures.append({"fileName": name, "message": message})

    applications, processing_failures, _ = resume_service.process(
        uploaded_files(), context, source=payload.source, role=payload.role
    )
    failures.extend(processing_failures)
    return {
        "applications": applications,
        "failures": failures,
        "message": f"{len(applications)} resume{'s' if len(applications) != 1 else ''} processed",
    }


@app.post("/api/applications", status_code=201)
def upload_applications(
    context: Context,
    resumes: Annotated[list[UploadFile], File()],
    role: Annotated[str, Form()] = "Open application",
    source: Annotated[str, Form()] = "Direct upload",
) -> dict[str, object]:
    _, _, resume_service, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    if not resumes:
        raise AppError("Upload at least one resume file.")
    if len(resumes) > settings.max_upload_files:
        raise AppError(f"Upload no more than {settings.max_upload_files} resumes in one batch.", 413, "too_many_files")
    files = [
        {
            "name": item.filename or "resume",
            "content": item.file.read(settings.max_upload_bytes + 1),
            "mimeType": item.content_type or "",
        }
        for item in resumes
    ]
    applications, failures, _ = resume_service.process(files, context, source=source, role=role)
    return {
        "applications": applications,
        "failures": failures,
        "message": f"{len(applications)} resume{'s' if len(applications) != 1 else ''} processed",
    }


@app.post("/api/applications/bulk-update")
def bulk_update(payload: BulkUpdateRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    applications = repository.update_applications(payload.ids, payload.updates.database_changes(), context)
    repository.audit(context, "application.bulk_updated", "application", None, {"count": len(applications)})
    return {"applications": applications, "updatedCount": len(applications)}


@app.post("/api/applications/bulk-delete")
def bulk_delete(payload: BulkDeleteRequest, context: Context) -> dict[str, int]:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    count = repository.delete_applications(payload.ids, context)
    repository.audit(context, "application.bulk_deleted", "application", None, {"count": count})
    return {"deletedCount": count}


@app.get("/api/applications/{application_id}")
def get_application(application_id: str, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    application = next((item for item in repository.list_applications(context) if item["id"] == application_id), None)
    if not application:
        raise AppError("Application not found.", 404, "not_found")
    return {"application": application}


@app.patch("/api/applications/{application_id}")
def update_application(application_id: str, payload: ApplicationUpdate, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    applications = repository.update_applications([application_id], payload.database_changes(), context)
    if not applications:
        raise AppError("Application not found.", 404, "not_found")
    repository.audit(
        context, "application.updated", "application", application_id, {"fields": list(payload.database_changes())}
    )
    return {"application": applications[0]}


@app.delete("/api/applications/{application_id}", status_code=204)
def delete_application(application_id: str, context: Context) -> Response:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    if repository.delete_applications([application_id], context) == 0:
        raise AppError("Application not found.", 404, "not_found")
    repository.audit(context, "application.deleted", "application", application_id)
    return Response(status_code=204)


@app.get("/api/jobs")
def list_jobs(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    return {"jobs": repository.list_jobs(context)}


@app.post("/api/jobs", status_code=201)
def create_job(payload: JobCreateRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    job = repository.create_job(
        {
            "title": payload.title.strip(),
            "department": payload.department.strip(),
            "location": payload.location.strip(),
            "description": payload.description.strip(),
        },
        context,
    )
    repository.audit(context, "job.created", "job", job["id"])
    return {"job": job}


@app.get("/api/team/members")
def list_team_members(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    is_master = context.email.strip().lower() == "sumithsbhatt@gmail.com"
    return {
        "members": repository.list_team_members(context),
        "currentUserRole": "owner" if is_master else context.role,
    }


@app.post("/api/team/invitations", status_code=201)
def invite_team_member(payload: TeamInviteRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin")
    member = repository.invite_team_member(context, payload.email, payload.role)
    repository.audit(
        context,
        "team.member_invited",
        "organization_member",
        member["userId"],
        {"email": payload.email, "role": payload.role},
    )
    return {"member": member}


@app.post("/api/team/provision", status_code=201)
def provision_team_member(payload: ProvisionUserRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, email_service = services.require()
    require_role(context, "owner", "admin")

    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    temp_pass = payload.temporaryPassword or "".join(secrets.choice(alphabet) for _ in range(12))

    org_name = "Nexerra Workspace"
    if context.email:
        org_name = f"{context.email.split('@')[0].title()}'s Workspace"

    member = repository.provision_user(
        context=context,
        email=payload.email,
        full_name=payload.fullName or "",
        role=payload.role,
        temporary_password=temp_pass,
        organization_name=org_name,
    )

    email_sent, email_message = email_service.send_welcome_account_email(
        email=payload.email,
        full_name=payload.fullName or "",
        temporary_password=temp_pass,
        role=payload.role,
        organization_name=org_name,
    )

    repository.audit(
        context,
        "team.user_provisioned",
        "organization_member",
        member["userId"],
        {"email": payload.email, "role": payload.role, "emailSent": email_sent, "emailMessage": email_message},
    )

    return {
        "member": member,
        "emailSent": email_sent,
        "emailMessage": email_message,
        "temporaryPassword": temp_pass,
        "organizationName": org_name,
    }


@app.post("/api/auth/complete-password-change")
def complete_password_change(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    repository.complete_password_change(context)
    repository.audit(
        context,
        "user.password_changed",
        "profile",
        context.user_id,
        {"must_change_password": False},
    )
    return {"status": "success", "message": "Password updated successfully."}


@app.post("/api/auth/master-bootstrap")
def master_bootstrap(payload: MasterBootstrapRequest) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    return repository.bootstrap_master_admin(payload.email, payload.password)


@app.delete("/api/team/members/{user_id}", status_code=204)
def remove_team_member(user_id: str, context: Context) -> Response:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin")
    if user_id == context.user_id:
        raise AppError("You cannot remove yourself from the workspace.", 409, "cannot_remove_self")
    target_role = repository.membership_role(context.organization_id, user_id)
    if target_role == "owner":
        raise AppError("The workspace owner cannot be removed.", 409, "cannot_remove_owner")
    if context.role == "admin" and target_role == "admin":
        raise AppError("Only the workspace owner can remove an administrator.", 403, "permission_denied")
    if not repository.remove_team_member(context, user_id):
        raise AppError("Team member not found.", 404, "not_found")
    repository.audit(context, "team.member_removed", "organization_member", user_id)
    return Response(status_code=204)


@app.get("/api/campaigns/eligible")
def eligible_candidates(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    return {"candidates": _eligible(repository.list_applications(context))}


@app.get("/api/campaigns")
def list_campaigns(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    return {"campaigns": repository.list_campaigns(context)}


@app.post("/api/campaigns", status_code=201)
def create_campaign(payload: CampaignCreateRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, email_service = services.require()
    require_role(context, "owner", "admin", "recruiter")
    if payload.jobId and not any(job["id"] == payload.jobId for job in repository.list_jobs(context)):
        raise AppError("Opening not found in this workspace.", 404, "not_found")
    eligible = _eligible(repository.list_applications(context))
    recipients: list[dict[str, Any]] = []
    if payload.applicationIds is not None:
        selected = set(payload.applicationIds)
        recipients = [candidate for candidate in eligible if candidate["applicationId"] in selected]
    elif not payload.customRecipients:
        recipients = list(eligible)

    if payload.customRecipients:
        for cr in payload.customRecipients:
            email = str(cr.get("email") or "").strip().lower()
            if email and "@" in email and not any(r["email"].lower() == email for r in recipients):
                recipients.append(
                    {
                        "applicationId": str(uuid.uuid4()),
                        "candidateName": str(cr.get("candidateName") or email.split("@")[0].capitalize()),
                        "email": email,
                        "role": str(cr.get("role") or "Candidate"),
                        "status": "custom",
                        "isCustom": True,
                        "primarySkill": "General",
                    }
                )

    if not recipients:
        raise AppError("Select at least one eligible candidate or add a test recipient.", 400, "no_campaign_recipients")
    if len(recipients) > 500:
        raise AppError(
            "A campaign can include at most 500 recipients. Narrow the selection and create another campaign.",
            413,
            "campaign_too_large",
        )
    campaign_id = str(uuid.uuid4())
    campaign = repository.create_campaign(
        {
            "id": campaign_id,
            "jobId": payload.jobId,
            "title": payload.title.strip(),
            "subject": payload.subject.strip(),
            "body": payload.body.strip(),
            "status": "sending" if settings.email_configured else "draft",
        },
        recipients,
        context,
    )
    if settings.email_configured:
        sent, failed = email_service.deliver_campaign(
            campaign_id,
            payload.subject.strip(),
            payload.body.strip(),
            context.organization_id,
            recipients,
        )
        campaign = repository.update_campaign_delivery(campaign_id, sent, failed, context)
    repository.audit(
        context,
        "campaign.created",
        "email_campaign",
        campaign_id,
        {"recipients": len(recipients), "sent": campaign["sentCount"]},
    )
    return {"campaign": campaign, "providerConfigured": settings.email_configured}


@app.get("/api/integrations/gmail/status")
def gmail_status(context: Context) -> dict[str, object]:
    _, _, _, gmail, _ = services.require()
    return {"gmail": gmail.status(context)}


@app.get("/api/integrations/gmail/auth-url")
def gmail_auth_url(context: Context) -> dict[str, str]:
    _, _, _, gmail, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    return {"url": gmail.authorization_url(context)}


@app.get("/api/integrations/gmail/callback")
def gmail_callback(code: str = "", state: str = "", error: str = "") -> RedirectResponse:
    _, _, _, gmail, _ = services.require()
    if error:
        raise AppError(f"Google authorization was cancelled: {error}", 400, "oauth_cancelled")
    return RedirectResponse(gmail.callback(code, state), status_code=302)


@app.post("/api/integrations/gmail/import", status_code=201)
def gmail_import(payload: GmailImportRequest, context: Context) -> dict[str, object]:
    _, _, _, gmail, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    return gmail.import_resumes(payload.query, payload.role, payload.maxResults, context)


@app.post("/api/integrations/gmail/disconnect")
def gmail_disconnect(context: Context) -> dict[str, object]:
    _, _, _, gmail, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    gmail.disconnect(context)
    return {"gmail": gmail.status(context)}


@app.get("/api/email/unsubscribe", response_class=HTMLResponse)
def unsubscribe(token: Annotated[str, Query(min_length=20)]) -> HTMLResponse:
    repository, _, _, _, email_service = services.require()
    organization_id, email = email_service.verify_unsubscribe(token)
    repository.opt_out_email(organization_id, email)
    return HTMLResponse(
        "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width'>"
        "<title>Preferences updated</title></head>"
        "<body style='font-family:Arial,sans-serif;padding:48px;color:#18212f'>"
        "<h1>Preferences updated</h1>"
        "<p>You will no longer receive job opening notifications from this workspace.</p>"
        "</body></html>"
    )


@app.get("/api/reports/summary")
def report_summary(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    return {"report": _build_report(repository.list_applications(context))}


@app.get("/api/reports/export")
def report_export(context: Context, format: str = "csv") -> Response:
    repository, _, _, _, _ = services.require()
    applications = repository.list_applications(context)
    if format.lower() == "json":
        return JSONResponse(
            {"report": _build_report(applications), "applications": applications},
            headers={"Content-Disposition": 'attachment; filename="resume-report.json"'},
        )
    output = io.StringIO()
    columns = [
        "candidateName",
        "email",
        "phone",
        "primarySkill",
        "skillScorePercent",
        "matchedSkills",
        "location",
        "experienceYears",
        "status",
        "role",
        "source",
        "summary",
        "notes",
        "tags",
        "uploadedAt",
        "originalName",
    ]
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for application in applications:
        writer.writerow(
            {
                **application,
                "matchedSkills": "; ".join(application["matchedSkills"]),
                "tags": "; ".join(application["tags"]),
            }
        )
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="resume-report.csv"'},
    )


def _eligible(applications: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    emails: set[str] = set()
    for application in applications:
        email = str(application.get("email") or "").strip().lower()
        if not email or email in emails or application.get("status") == "hired" or application.get("emailOptOut"):
            continue
        emails.add(email)
        result.append(
            {
                "applicationId": application["id"],
                "candidateName": application["candidateName"],
                "email": application["email"],
                "role": application["role"],
                "status": application["status"],
                "primarySkill": application["primarySkill"],
            }
        )
    return result


def _build_report(applications: list[dict[str, Any]]) -> dict[str, object]:
    today = utc_now()[:10]
    skill_counts = Counter(str(item.get("primarySkillKey") or "general") for item in applications)
    location_counts = Counter(str(item.get("location") or "Unknown") for item in applications)
    status_counts = Counter(str(item.get("status") or "new") for item in applications)
    top_skills = Counter(skill for item in applications for skill in item.get("matchedSkills", []))
    labels = {str(item["key"]): str(item["label"]) for item in SKILL_CATEGORIES}
    return {
        "total": len(applications),
        "uploadedToday": sum(str(item.get("uploadedAt", "")).startswith(today) for item in applications),
        "needsReview": status_counts["needs_review"],
        "duplicateCount": sum(bool(item.get("duplicateOf")) for item in applications),
        "averageSkillScore": round(
            sum(int(item.get("skillScorePercent") or 0) for item in applications) / len(applications)
        )
        if applications
        else 0,
        "bySkill": [
            {"key": key, "label": labels.get(key, "General Review"), "count": count}
            for key, count in skill_counts.most_common()
        ],
        "byLocation": [{"location": key, "count": count} for key, count in location_counts.most_common()],
        "byStatus": [{"status": key, "count": count} for key, count in status_counts.most_common()],
        "topSkills": [{"skill": key, "count": count} for key, count in top_skills.most_common(12)],
        "recentUploads": applications[:8],
    }


# ==========================================
# NEXERRA TALENT OS V11 ENDPOINTS
# ==========================================


@app.get("/api/candidates")
def list_candidates(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    candidates = repository.list_candidates(context)
    return {"candidates": candidates, "total": len(candidates)}


@app.get("/api/candidates/{candidate_id}")
def get_candidate(candidate_id: str, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    candidate = repository.get_candidate(candidate_id, context)
    if not candidate:
        raise AppError("Candidate not found.", 404, "not_found")
    events = repository.list_candidate_events(candidate_id, context)
    return {"candidate": candidate, "events": events}


@app.patch("/api/candidates/{candidate_id}")
def update_candidate(candidate_id: str, payload: CandidateUpdateRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    changes = payload.model_dump(exclude_none=True)
    updated = repository.update_candidate(candidate_id, changes, context)
    if not updated:
        raise AppError("Candidate not found.", 404, "not_found")
    repository.record_candidate_event(
        candidate_id, "profile_updated", context.user_id, {"fields": list(changes.keys())}, context
    )
    return {"candidate": updated}


@app.post("/api/candidates/{candidate_id}/reveal")
def reveal_candidate_identity(candidate_id: str, payload: BlindRevealRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    candidate = repository.get_candidate(candidate_id, context)
    if not candidate:
        raise AppError("Candidate not found.", 404, "not_found")
    repository.record_candidate_event(
        candidate_id,
        "identity_revealed",
        context.user_id,
        {"reason": payload.reason, "blindId": candidate.get("blindId")},
        context,
    )
    repository.audit(context, "candidate.identity_revealed", "candidate", candidate_id, {"reason": payload.reason})
    return {"candidate": candidate, "revealed": True}


@app.post("/api/search/natural")
def natural_search(payload: NaturalSearchRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    candidates = repository.list_candidates(context)
    result = execute_hybrid_search(payload.query, candidates)
    return result


@app.post("/api/rediscovery")
def rediscover_talent(payload: RediscoveryRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    all_candidates = repository.list_candidates(context)
    applications = repository.list_applications(context)
    jobs = repository.list_jobs(context)

    target_job = None
    if payload.jobId:
        target_job = next((j for j in jobs if j["id"] == payload.jobId), None)
    if not target_job:
        target_job = {
            "title": payload.query or "Senior Engineering Specialist",
            "description": payload.query or "Engineering deliverables, distributed systems, and technical execution",
            "location": "Any",
        }

    return rediscover_candidates_for_job(target_job, all_candidates, applications, min_score=payload.minScore)


@app.get("/api/jobs/{job_id}/matches")
def job_matches(job_id: str, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    jobs = repository.list_jobs(context)
    job = next((j for j in jobs if j["id"] == job_id), None)
    if not job:
        raise AppError("Job opening not found.", 404, "not_found")
    candidates = repository.list_candidates(context)
    matches = []
    for cand in candidates:
        match_data = compute_multidimensional_match(cand, job)
        matches.append({"candidate": cand, "match": match_data})
    matches.sort(key=lambda m: m["match"]["overallScore"], reverse=True)
    return {"job": job, "matches": matches}


@app.post("/api/candidates/compare")
def compare_candidates(payload: CandidateCompareRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    all_candidates = repository.list_candidates(context)
    selected = [c for c in all_candidates if c["id"] in payload.candidateIds]
    if len(selected) < 2:
        raise AppError("Select at least two valid candidates to compare.", 400, "invalid_comparison")
    job = None
    if payload.jobId:
        jobs = repository.list_jobs(context)
        job = next((j for j in jobs if j["id"] == payload.jobId), None)
    if not job:
        job = {"title": "Target Role", "description": "Candidate evaluation requirements"}

    evaluations = []
    for cand in selected:
        match_data = compute_multidimensional_match(cand, job)
        evaluations.append({"candidate": cand, "match": match_data})

    return {
        "job": job,
        "evaluations": evaluations,
        "recommendation": f"{selected[0].get('canonicalName')} shows stronger verified skills alignment for this role.",
    }


@app.get("/api/talent-pools")
def list_talent_pools(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    return {"pools": repository.list_talent_pools(context)}


@app.post("/api/talent-pools", status_code=201)
def create_talent_pool(payload: TalentPoolCreateRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    pool = repository.create_talent_pool(payload.name, payload.description, context)
    return {"pool": pool}


@app.post("/api/talent-pools/{pool_id}/members")
def add_talent_pool_members(pool_id: str, payload: TalentPoolAddRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    count = repository.add_to_talent_pool(pool_id, payload.candidateIds, context)
    return {"addedCount": count}


@app.delete("/api/talent-pools/{pool_id}/members/{candidate_id}", status_code=204)
def remove_talent_pool_member(pool_id: str, candidate_id: str, context: Context) -> Response:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    repository.remove_from_talent_pool(pool_id, candidate_id, context)
    return Response(status_code=204)


@app.post("/api/copilot/chat")
def copilot_chat(payload: CopilotChatRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    candidates = repository.list_candidates(context)
    jobs = repository.list_jobs(context)
    response = process_copilot_message(
        payload.message,
        candidates,
        jobs,
        active_candidate_id=payload.activeCandidateId,
        active_job_id=payload.activeJobId,
    )
    return response


@app.get("/api/queue/jobs")
def queue_jobs(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    return {"jobs": repository.list_processing_jobs(context)}


@app.post("/api/duplicates/merge")
def merge_duplicate_candidates(payload: CandidateMergeRequest, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    result = repository.merge_candidates(payload.primaryCandidateId, payload.secondaryCandidateId, context)
    return result


@app.delete("/api/candidates/{candidate_id}", status_code=204)
def delete_candidate(candidate_id: str, context: Context) -> Response:
    repository, _, _, _, _ = services.require()
    require_role(context, "owner", "admin", "recruiter")
    if not repository.delete_candidate(candidate_id, context):
        raise AppError("Candidate not found", 404, "not_found")
    repository.audit(context, "candidate.deleted", "candidate", candidate_id)
    return Response(status_code=204)


@app.get("/api/candidates/{candidate_id}/graph")
def candidate_talent_graph(candidate_id: str, context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    cand = repository.get_candidate(candidate_id, context)
    if not cand:
        raise AppError("Candidate not found", 404, "not_found")
    all_candidates = repository.list_candidates(context)
    jobs = repository.list_jobs(context)
    graph = build_candidate_talent_graph(cand, all_candidates, jobs)
    return graph


@app.get("/api/talent-graph")
def talent_network_graph(context: Context) -> dict[str, object]:
    repository, _, _, _, _ = services.require()
    candidates = repository.list_candidates(context)
    jobs = repository.list_jobs(context)
    return build_talent_network_overview(candidates, jobs)


@app.get("/api/agency/clients")
def list_agency_clients() -> dict[str, object]:
    return {"clients": agency_client_service.list_clients()}


@app.get("/api/agency/overview")
def agency_overview() -> dict[str, object]:
    return agency_client_service.get_agency_overview()


@app.post("/api/agency/clients")
def create_agency_client(payload: dict[str, Any], context: Context) -> dict[str, object]:
    require_role(context, "owner", "admin", "recruiter")
    created = agency_client_service.create_client(payload)
    return {"client": created}


@app.post("/api/agency/clients/{client_id}/switch")
def switch_agency_client(client_id: str) -> dict[str, object]:
    result = agency_client_service.set_active_client(client_id)
    return result


dist_dir = Path(__file__).resolve().parent.parent / "dist"
if dist_dir.exists():
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    assets_dir = dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise AppError("Not Found", 404, "not_found")
        target_file = dist_dir / full_path
        if target_file.is_file():
            return FileResponse(target_file)
        index_file = dist_dir / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        return Response("SPA not built. Run 'npm run build'.", status_code=404)



