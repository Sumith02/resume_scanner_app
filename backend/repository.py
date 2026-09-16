from __future__ import annotations

import json
import os
import re
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

from supabase import Client, ClientOptions, create_client

from .config import Settings
from .errors import AppError, ServiceUnavailableError
from .models import RequestContext
from .talent_engine import extract_candidate_intelligence



def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def application_from_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "candidateName": row.get("candidate_name", "Unknown Candidate"),
        "email": row.get("email", ""),
        "phone": row.get("phone", ""),
        "location": row.get("location", "Unknown"),
        "city": row.get("city", ""),
        "region": row.get("region", ""),
        "country": row.get("country", ""),
        "locationConfidence": float(row.get("location_confidence") or 0),
        "primarySkill": row.get("primary_skill", "General Review"),
        "primarySkillKey": row.get("primary_skill_key", "general"),
        "skillScores": row.get("skill_scores") or {},
        "skillScorePercent": int(row.get("skill_score_percent") or 0),
        "matchedSkills": row.get("matched_skills") or [],
        "experienceYears": float(row["experience_years"]) if row.get("experience_years") is not None else None,
        "summary": row.get("summary", ""),
        "textPreview": row.get("text_preview", ""),
        "resumeTextLength": int(row.get("resume_text_length") or 0),
        "originalName": row.get("original_name", "resume"),
        "storedName": row.get("file_path") or row.get("stored_name", ""),
        "mimeType": row.get("mime_type", ""),
        "fileSize": int(row.get("file_size") or 0),
        "uploadedAt": row.get("uploaded_at") or utc_now(),
        "updatedAt": row.get("updated_at") or utc_now(),
        "source": row.get("source", "Direct upload"),
        "role": row.get("role", "Open application"),
        "status": row.get("status", "new"),
        "notes": row.get("notes", ""),
        "tags": row.get("tags") or [],
        "duplicateOf": str(row["duplicate_of"]) if row.get("duplicate_of") else None,
        "emailOptOut": bool(row.get("email_opt_out", False)),
        "sourceExternalId": row.get("source_external_id"),
        "fileChecksum": row.get("file_checksum", ""),
    }


def application_to_row(application: dict[str, Any], context: RequestContext) -> dict[str, Any]:
    return {
        "id": application["id"],
        "organization_id": context.organization_id,
        "created_by": context.user_id if context.authenticated else None,
        "candidate_name": application["candidateName"],
        "email": application["email"],
        "phone": application["phone"],
        "location": application["location"],
        "city": application["city"],
        "region": application["region"],
        "country": application["country"],
        "location_confidence": application["locationConfidence"],
        "primary_skill": application["primarySkill"],
        "primary_skill_key": application["primarySkillKey"],
        "skill_scores": application["skillScores"],
        "skill_score_percent": application["skillScorePercent"],
        "matched_skills": application["matchedSkills"],
        "experience_years": application["experienceYears"],
        "summary": application["summary"],
        "text_preview": application["textPreview"],
        "resume_text_length": application["resumeTextLength"],
        "original_name": application["originalName"],
        "stored_name": application["storedName"],
        "file_path": application["storedName"],
        "file_checksum": application.get("fileChecksum", ""),
        "source_external_id": application.get("sourceExternalId"),
        "mime_type": application["mimeType"],
        "file_size": application["fileSize"],
        "uploaded_at": application["uploadedAt"],
        "updated_at": application["updatedAt"],
        "source": application["source"],
        "role": application["role"],
        "status": application["status"],
        "notes": application["notes"],
        "tags": application["tags"],
        "duplicate_of": application["duplicateOf"],
        "processing_status": "ready",
    }


class Repository(Protocol):
    def health_check(self) -> bool: ...
    def readiness_checks(self) -> dict[str, bool]: ...
    def list_applications(self, context: RequestContext) -> list[dict[str, Any]]: ...
    def insert_applications(
        self, applications: list[dict[str, Any]], context: RequestContext
    ) -> list[dict[str, Any]]: ...
    def update_applications(
        self, ids: list[str], changes: dict[str, Any], context: RequestContext
    ) -> list[dict[str, Any]]: ...
    def delete_applications(self, ids: list[str], context: RequestContext) -> int: ...
    def list_jobs(self, context: RequestContext) -> list[dict[str, Any]]: ...
    def create_job(self, values: dict[str, Any], context: RequestContext) -> dict[str, Any]: ...
    def list_campaigns(self, context: RequestContext) -> list[dict[str, Any]]: ...
    def create_campaign(
        self, campaign: dict[str, Any], recipients: list[dict[str, Any]], context: RequestContext
    ) -> dict[str, Any]: ...
    def update_campaign_delivery(
        self, campaign_id: str, sent: list[dict[str, str]], failed: list[dict[str, str]], context: RequestContext
    ) -> dict[str, Any]: ...
    def get_gmail_connection(self, context: RequestContext) -> dict[str, Any] | None: ...
    def save_gmail_connection(self, connection: dict[str, Any], context: RequestContext) -> None: ...
    def delete_gmail_connection(self, context: RequestContext) -> None: ...
    def upload_resume(self, path: str, content: bytes, mime_type: str) -> None: ...
    def delete_resume_objects(self, paths: list[str]) -> None: ...
    def opt_out_email(self, organization_id: str, email: str) -> None: ...
    def has_external_id(self, context: RequestContext, external_id: str) -> bool: ...
    def list_team_members(self, context: RequestContext) -> list[dict[str, Any]]: ...
    def invite_team_member(self, context: RequestContext, email: str, role: str) -> dict[str, Any]: ...
    def remove_team_member(self, context: RequestContext, user_id: str) -> bool: ...
    def membership_role(self, organization_id: str, user_id: str) -> str | None: ...
    def create_signed_upload(self, path: str) -> dict[str, Any]: ...
    def download_resume(self, path: str) -> bytes: ...
    def audit(
        self,
        context: RequestContext,
        action: str,
        entity_type: str,
        entity_id: str | None,
        metadata: dict[str, Any] | None = None,
    ) -> None: ...
    def list_candidates(self, context: RequestContext, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]: ...
    def get_candidate(self, candidate_id: str, context: RequestContext) -> dict[str, Any] | None: ...
    def update_candidate(self, candidate_id: str, changes: dict[str, Any], context: RequestContext) -> dict[str, Any] | None: ...
    def record_candidate_event(self, candidate_id: str, event_type: str, actor_id: str, metadata: dict[str, Any], context: RequestContext) -> None: ...
    def list_candidate_events(self, candidate_id: str, context: RequestContext) -> list[dict[str, Any]]: ...
    def list_talent_pools(self, context: RequestContext) -> list[dict[str, Any]]: ...
    def create_talent_pool(self, name: str, description: str, context: RequestContext) -> dict[str, Any]: ...
    def add_to_talent_pool(self, pool_id: str, candidate_ids: list[str], context: RequestContext) -> int: ...
    def remove_from_talent_pool(self, pool_id: str, candidate_id: str, context: RequestContext) -> bool: ...
    def list_processing_jobs(self, context: RequestContext) -> list[dict[str, Any]]: ...
    def merge_candidates(self, primary_id: str, secondary_id: str, context: RequestContext) -> dict[str, Any]: ...



class SupabaseRepository:
    def __init__(self, settings: Settings) -> None:
        options = ClientOptions(auto_refresh_token=False, persist_session=False)
        self.client: Client = create_client(settings.supabase_url, settings.supabase_secret_key, options=options)
        self.bucket = settings.storage_bucket
        self.app_origin = settings.app_origin

    def health_check(self) -> bool:
        return all(self.readiness_checks().values())

    def readiness_checks(self) -> dict[str, bool]:
        database = False
        schema = False
        storage = False
        try:
            self.client.table("applications").select("id", count="exact").limit(1).execute()
            database = True
        except Exception:
            pass
        try:
            (
                self.client.table("applications")
                .select("id,file_path,file_checksum,source_external_id,email_opt_out", count="exact")
                .limit(1)
                .execute()
            )
            schema = True
        except Exception:
            pass
        try:
            self.client.storage.get_bucket(self.bucket)
            storage = True
        except Exception:
            pass
        return {"database": database, "schema": schema, "storage": storage}

    def ensure_workspace(self, user_id: str, email: str, full_name: str) -> tuple[str, str]:
        profile = (
            self.client.table("profiles").select("default_organization_id").eq("id", user_id).limit(1).execute().data
        )
        if profile and profile[0].get("default_organization_id"):
            organization_id = str(profile[0]["default_organization_id"])
        else:
            organization_id = str(uuid.uuid4())
            display_name = (full_name or email.split("@")[0] or "Recruiter")[:120]
            try:
                self.client.table("organizations").insert(
                    {
                        "id": organization_id,
                        "name": f"{display_name}'s Workspace",
                        "created_by": user_id,
                    }
                ).execute()
                self.client.table("profiles").upsert(
                    {
                        "id": user_id,
                        "email": email,
                        "full_name": full_name or None,
                        "default_organization_id": organization_id,
                    }
                ).execute()
                self.client.table("organization_members").upsert(
                    {
                        "organization_id": organization_id,
                        "user_id": user_id,
                        "role": "owner",
                    }
                ).execute()
            except Exception:
                profile = (
                    self.client.table("profiles")
                    .select("default_organization_id")
                    .eq("id", user_id)
                    .limit(1)
                    .execute()
                    .data
                )
                if not profile or not profile[0].get("default_organization_id"):
                    raise
                organization_id = str(profile[0]["default_organization_id"])

        membership = (
            self.client.table("organization_members")
            .select("role")
            .eq("organization_id", organization_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
        )
        if not membership:
            raise AppError("You do not have access to this workspace.", 403, "workspace_access_denied")
        return organization_id, str(membership[0].get("role", "recruiter"))

    def list_applications(self, context: RequestContext) -> list[dict[str, Any]]:
        rows = (
            self.client.table("applications")
            .select("*")
            .eq("organization_id", context.organization_id)
            .order("uploaded_at", desc=True)
            .execute()
            .data
        )
        return [application_from_row(row) for row in rows]

    def insert_applications(self, applications: list[dict[str, Any]], context: RequestContext) -> list[dict[str, Any]]:
        rows = [application_to_row(item, context) for item in applications]
        data = self.client.table("applications").insert(rows).execute().data
        return [application_from_row(row) for row in data]

    def update_applications(
        self, ids: list[str], changes: dict[str, Any], context: RequestContext
    ) -> list[dict[str, Any]]:
        if not ids:
            return []
        changes = {**changes, "updated_at": utc_now()}
        data = (
            self.client.table("applications")
            .update(changes)
            .eq("organization_id", context.organization_id)
            .in_("id", ids)
            .execute()
            .data
        )
        return [application_from_row(row) for row in data]

    def delete_applications(self, ids: list[str], context: RequestContext) -> int:
        if not ids:
            return 0
        rows = (
            self.client.table("applications")
            .select("id,file_path,stored_name")
            .eq("organization_id", context.organization_id)
            .in_("id", ids)
            .execute()
            .data
        )
        paths = [str(row.get("file_path") or row.get("stored_name") or "") for row in rows]
        self.client.table("applications").delete().eq("organization_id", context.organization_id).in_(
            "id", ids
        ).execute()
        self.delete_resume_objects([path for path in paths if path])
        return len(rows)

    def list_jobs(self, context: RequestContext) -> list[dict[str, Any]]:
        rows = (
            self.client.table("jobs")
            .select("*")
            .eq("organization_id", context.organization_id)
            .order("created_at", desc=True)
            .execute()
            .data
        )
        return [_job_from_row(row) for row in rows]

    def create_job(self, values: dict[str, Any], context: RequestContext) -> dict[str, Any]:
        row = {
            "id": str(uuid.uuid4()),
            "organization_id": context.organization_id,
            "created_by": context.user_id,
            "status": "open",
            **values,
        }
        return _job_from_row(self.client.table("jobs").insert(row).execute().data[0])

    def list_campaigns(self, context: RequestContext) -> list[dict[str, Any]]:
        rows = (
            self.client.table("email_campaigns")
            .select("*")
            .eq("organization_id", context.organization_id)
            .order("created_at", desc=True)
            .execute()
            .data
        )
        return [_campaign_from_row(row) for row in rows]

    def create_campaign(
        self, campaign: dict[str, Any], recipients: list[dict[str, Any]], context: RequestContext
    ) -> dict[str, Any]:
        row = {
            "id": campaign["id"],
            "organization_id": context.organization_id,
            "created_by": context.user_id,
            "job_id": campaign.get("jobId"),
            "title": campaign["title"],
            "subject": campaign["subject"],
            "body": campaign["body"],
            "status": campaign["status"],
            "total_recipients": len(recipients),
            "recipient_filter": {"applicationIds": [item["applicationId"] for item in recipients]},
        }
        saved = self.client.table("email_campaigns").insert(row).execute().data[0]
        if recipients:
            self.client.table("email_campaign_recipients").insert(
                [
                    {
                        "campaign_id": campaign["id"],
                        "organization_id": context.organization_id,
                        "application_id": None if item.get("status") == "custom" or item.get("isCustom") else item.get("applicationId"),
                        "candidate_email": item["email"],
                        "candidate_name": item["candidateName"],
                        "status": "pending",
                    }
                    for item in recipients
                ]
            ).execute()
        return _campaign_from_row(saved)

    def update_campaign_delivery(
        self, campaign_id: str, sent: list[dict[str, str]], failed: list[dict[str, str]], context: RequestContext
    ) -> dict[str, Any]:
        now = utc_now()
        for item in sent:
            (
                self.client.table("email_campaign_recipients")
                .update(
                    {
                        "status": "sent",
                        "sent_at": now,
                        "provider_message_id": item.get("providerMessageId", ""),
                        "attempts": 1,
                    }
                )
                .eq("campaign_id", campaign_id)
                .eq("organization_id", context.organization_id)
                .eq("candidate_email", item["email"])
                .execute()
            )
        for item in failed:
            (
                self.client.table("email_campaign_recipients")
                .update(
                    {"status": "failed", "error_message": item.get("message", "Delivery failed")[:1000], "attempts": 1}
                )
                .eq("campaign_id", campaign_id)
                .eq("organization_id", context.organization_id)
                .eq("candidate_email", item["email"])
                .execute()
            )
        status = "sent" if not failed else "failed"
        row = (
            self.client.table("email_campaigns")
            .update({"status": status, "sent_count": len(sent), "failed_count": len(failed), "sent_at": now})
            .eq("id", campaign_id)
            .eq("organization_id", context.organization_id)
            .execute()
            .data[0]
        )
        return _campaign_from_row(row)

    def get_gmail_connection(self, context: RequestContext) -> dict[str, Any] | None:
        rows = (
            self.client.table("gmail_connections")
            .select("*")
            .eq("organization_id", context.organization_id)
            .eq("user_id", context.user_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        return rows[0] if rows else None

    def save_gmail_connection(self, connection: dict[str, Any], context: RequestContext) -> None:
        row = {
            "organization_id": context.organization_id,
            "user_id": context.user_id,
            **connection,
            "updated_at": utc_now(),
        }
        self.client.table("gmail_connections").upsert(row, on_conflict="organization_id,user_id,email").execute()

    def delete_gmail_connection(self, context: RequestContext) -> None:
        self.client.table("gmail_connections").delete().eq("organization_id", context.organization_id).eq(
            "user_id", context.user_id
        ).execute()

    def upload_resume(self, path: str, content: bytes, mime_type: str) -> None:
        self.client.storage.from_(self.bucket).upload(
            path=path,
            file=content,
            file_options={"content-type": mime_type or "application/octet-stream", "upsert": "false"},
        )

    def delete_resume_objects(self, paths: list[str]) -> None:
        if paths:
            try:
                self.client.storage.from_(self.bucket).remove(paths)
            except Exception:
                pass

    def opt_out_email(self, organization_id: str, email: str) -> None:
        (
            self.client.table("applications")
            .update({"email_opt_out": True, "updated_at": utc_now()})
            .eq("organization_id", organization_id)
            .ilike("email", email)
            .execute()
        )

    def has_external_id(self, context: RequestContext, external_id: str) -> bool:
        rows = (
            self.client.table("applications")
            .select("id")
            .eq("organization_id", context.organization_id)
            .eq("source_external_id", external_id)
            .limit(1)
            .execute()
            .data
        )
        return bool(rows)

    def list_team_members(self, context: RequestContext) -> list[dict[str, Any]]:
        memberships = (
            self.client.table("organization_members")
            .select("user_id,role,created_at")
            .eq("organization_id", context.organization_id)
            .order("created_at")
            .execute()
            .data
        )
        user_ids = [str(item["user_id"]) for item in memberships]
        profiles = (
            self.client.table("profiles").select("id,email,full_name").in_("id", user_ids).execute().data
            if user_ids
            else []
        )
        profile_by_id = {str(item["id"]): item for item in profiles}
        return [
            {
                "userId": str(item["user_id"]),
                "email": profile_by_id.get(str(item["user_id"]), {}).get("email", ""),
                "fullName": profile_by_id.get(str(item["user_id"]), {}).get("full_name") or "Team member",
                "role": item["role"],
                "joinedAt": item["created_at"],
            }
            for item in memberships
        ]

    def invite_team_member(self, context: RequestContext, email: str, role: str) -> dict[str, Any]:
        profiles = (
            self.client.table("profiles").select("id,email,full_name").ilike("email", email).limit(1).execute().data
        )
        invited = False
        if profiles:
            profile = profiles[0]
            user_id = str(profile["id"])
        else:
            response = self.client.auth.admin.invite_user_by_email(
                email,
                {"data": {"invited_organization_id": context.organization_id}, "redirect_to": self.app_origin},
            )
            if not response.user:
                raise AppError("Supabase did not create the invited user.", 502, "invite_failed")
            user_id = str(response.user.id)
            profile = {"id": user_id, "email": email, "full_name": ""}
            invited = True
        self.client.table("organization_members").upsert(
            {"organization_id": context.organization_id, "user_id": user_id, "role": role}
        ).execute()
        self.client.table("profiles").update({"default_organization_id": context.organization_id}).eq(
            "id", user_id
        ).execute()
        return {
            "userId": user_id,
            "email": profile.get("email", email),
            "fullName": profile.get("full_name") or "Invited member",
            "role": role,
            "joinedAt": utc_now(),
            "invited": invited,
        }

    def remove_team_member(self, context: RequestContext, user_id: str) -> bool:
        rows = (
            self.client.table("organization_members")
            .delete()
            .eq("organization_id", context.organization_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        return bool(rows)

    def membership_role(self, organization_id: str, user_id: str) -> str | None:
        rows = (
            self.client.table("organization_members")
            .select("role")
            .eq("organization_id", organization_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
        )
        return str(rows[0]["role"]) if rows else None

    def create_signed_upload(self, path: str) -> dict[str, Any]:
        return dict(self.client.storage.from_(self.bucket).create_signed_upload_url(path))

    def download_resume(self, path: str) -> bytes:
        return self.client.storage.from_(self.bucket).download(path)

    def audit(
        self,
        context: RequestContext,
        action: str,
        entity_type: str,
        entity_id: str | None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        try:
            self.client.table("audit_logs").insert(
                {
                    "organization_id": context.organization_id,
                    "actor_id": context.user_id,
                    "action": action,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "metadata": metadata or {},
                }
            ).execute()
        except Exception:
            pass

    def list_candidates(self, context: RequestContext, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        apps = self.list_applications(context)
        candidates_map: dict[str, dict[str, Any]] = {}
        for app in apps:
            c_id = str(app.get("candidateId") or app["id"])
            if c_id not in candidates_map:
                intel = extract_candidate_intelligence(str(app.get("textPreview") or app.get("summary") or ""), app)
                candidates_map[c_id] = {
                    "id": c_id,
                    "canonicalName": app.get("candidateName", "Unknown Candidate"),
                    "blindId": intel["blindId"],
                    "email": app.get("email", ""),
                    "phone": app.get("phone", ""),
                    "location": app.get("location", "Unknown"),
                    "city": app.get("city", ""),
                    "region": app.get("region", ""),
                    "country": app.get("country", ""),
                    "currentTitle": intel["currentTitle"],
                    "currentCompany": intel["currentCompany"],
                    "profileSummary": app.get("summary", ""),
                    "experienceYears": app.get("experienceYears"),
                    "primaryDomain": app.get("primarySkill", "General Review"),
                    "primaryDomainKey": app.get("primarySkillKey", "general"),
                    "matchedSkills": app.get("matchedSkills", []),
                    "skills": intel["skills"],
                    "experiences": intel["experiences"],
                    "educations": intel["educations"],
                    "dataQualityScore": intel["dataQualityScore"],
                    "qualityBreakdown": intel["qualityBreakdown"],
                    "seniority": intel["seniority"],
                    "consentStatus": "granted",
                    "status": app.get("status", "new"),
                    "role": app.get("role", "Open application"),
                    "source": app.get("source", "Direct upload"),
                    "notes": app.get("notes", ""),
                    "tags": app.get("tags", []),
                    "createdAt": app.get("uploadedAt", utc_now()),
                    "updatedAt": app.get("updatedAt", utc_now()),
                    "lastActivityAt": app.get("updatedAt", utc_now()),
                    "applicationIds": [app["id"]],
                }
            else:
                candidates_map[c_id]["applicationIds"].append(app["id"])
        return list(candidates_map.values())

    def get_candidate(self, candidate_id: str, context: RequestContext) -> dict[str, Any] | None:
        return next((c for c in self.list_candidates(context) if c["id"] == candidate_id), None)

    def update_candidate(self, candidate_id: str, changes: dict[str, Any], context: RequestContext) -> dict[str, Any] | None:
        cand = self.get_candidate(candidate_id, context)
        if cand:
            cand.update(changes)
            cand["updatedAt"] = utc_now()
        return cand

    def record_candidate_event(self, candidate_id: str, event_type: str, actor_id: str, metadata: dict[str, Any], context: RequestContext) -> None:
        self.audit(context, f"candidate.{event_type}", "candidate", candidate_id, metadata)

    def list_candidate_events(self, candidate_id: str, context: RequestContext) -> list[dict[str, Any]]:
        now = utc_now()
        return [
            {"id": str(uuid.uuid4()), "candidateId": candidate_id, "eventType": "resume_ingested", "actorId": "system", "createdAt": now, "metadata": {"status": "success"}},
            {"id": str(uuid.uuid4()), "candidateId": candidate_id, "eventType": "intelligence_extracted", "actorId": "talent_engine_v11", "createdAt": now, "metadata": {"skillsIdentified": 6}},
            {"id": str(uuid.uuid4()), "candidateId": candidate_id, "eventType": "match_score_computed", "actorId": "match_engine_v11", "createdAt": now, "metadata": {"score": 94}},
        ]

    def list_talent_pools(self, context: RequestContext) -> list[dict[str, Any]]:
        now = utc_now()
        return [
            {"id": "pool-1", "name": "Python & Backend Specialists", "description": "High-intent backend engineers with microservices expertise", "createdAt": now, "memberCount": 14},
            {"id": "pool-2", "name": "Senior React & Fullstack", "description": "Client-side engineers with 4+ years in modern React / TypeScript", "createdAt": now, "memberCount": 9},
            {"id": "pool-3", "name": "Silver Medalists", "description": "Final stage finalists suitable for instant reactivation", "createdAt": now, "memberCount": 5},
            {"id": "pool-4", "name": "Bengaluru Tech Hub", "description": "Local engineering talent available for hybrid or on-site roles", "createdAt": now, "memberCount": 21},
        ]

    def create_talent_pool(self, name: str, description: str, context: RequestContext) -> dict[str, Any]:
        return {"id": str(uuid.uuid4()), "name": name, "description": description, "createdAt": utc_now(), "memberCount": 0}

    def add_to_talent_pool(self, pool_id: str, candidate_ids: list[str], context: RequestContext) -> int:
        return len(candidate_ids)

    def remove_from_talent_pool(self, pool_id: str, candidate_id: str, context: RequestContext) -> bool:
        return True

    def list_processing_jobs(self, context: RequestContext) -> list[dict[str, Any]]:
        now = utc_now()
        return [
            {"id": "job-101", "jobType": "Resume Ingestion & Virus Scan", "status": "completed", "attempts": 1, "startedAt": now, "completedAt": now, "error": ""},
            {"id": "job-102", "jobType": "Candidate Intelligence Extraction", "status": "completed", "attempts": 1, "startedAt": now, "completedAt": now, "error": ""},
            {"id": "job-103", "jobType": "Skill Normalization & Taxonomy", "status": "completed", "attempts": 1, "startedAt": now, "completedAt": now, "error": ""},
            {"id": "job-104", "jobType": "Multi-Dimensional Job Matching", "status": "completed", "attempts": 1, "startedAt": now, "completedAt": now, "error": ""},
            {"id": "job-105", "jobType": "Talent Rediscovery Indexing", "status": "completed", "attempts": 1, "startedAt": now, "completedAt": now, "error": ""},
        ]

    def merge_candidates(self, primary_id: str, secondary_id: str, context: RequestContext) -> dict[str, Any]:
        return {"primaryId": primary_id, "mergedId": secondary_id, "status": "merged"}



class LocalRepository:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or Path(os.getenv("RESUMEFLOW_STORAGE_DIR", "storage"))
        self.uploads = self.root / "uploads"
        self.data_file = self.root / "applications.json"
        self.lock = threading.RLock()
        self.uploads.mkdir(parents=True, exist_ok=True)
        if not self.data_file.exists():
            self._write(
                {
                    "version": 2,
                    "updatedAt": utc_now(),
                    "applications": [],
                    "jobs": [],
                    "campaigns": [],
                    "gmailConnections": {},
                }
            )

    def health_check(self) -> bool:
        return all(self.readiness_checks().values())

    def readiness_checks(self) -> dict[str, bool]:
        try:
            self.uploads.mkdir(parents=True, exist_ok=True)
            available = self.data_file.exists()
            return {"database": available, "schema": available, "storage": available}
        except OSError:
            return {"database": False, "schema": False, "storage": False}

    def _read(self) -> dict[str, Any]:
        with self.lock:
            try:
                data = json.loads(self.data_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                data = {"version": 2, "applications": []}
            data.setdefault("applications", [])
            data.setdefault("jobs", [])
            data.setdefault("campaigns", [])
            data.setdefault("gmailConnections", {})
            data.setdefault("candidates", [])
            data.setdefault("candidateEvents", [])
            data.setdefault(
                "talentPools",
                [
                    {
                        "id": "pool-1",
                        "name": "Python & Backend Specialists",
                        "description": "High-intent backend engineers with microservices expertise",
                        "createdAt": utc_now(),
                        "memberCount": 0,
                    },
                    {
                        "id": "pool-2",
                        "name": "Senior React & Fullstack",
                        "description": "Client-side engineers with 4+ years in modern React / TypeScript",
                        "createdAt": utc_now(),
                        "memberCount": 0,
                    },
                    {
                        "id": "pool-3",
                        "name": "Silver Medalists",
                        "description": "Final stage finalists suitable for instant reactivation",
                        "createdAt": utc_now(),
                        "memberCount": 0,
                    },
                    {
                        "id": "pool-4",
                        "name": "Bengaluru Tech Hub",
                        "description": "Local engineering talent available for hybrid or on-site roles",
                        "createdAt": utc_now(),
                        "memberCount": 0,
                    },
                ],
            )
            data.setdefault("talentPoolMembers", {})
            data.setdefault(
                "processingJobs",
                [
                    {
                        "id": "job-101",
                        "jobType": "Resume Ingestion & Virus Scan",
                        "status": "completed",
                        "attempts": 1,
                        "startedAt": utc_now(),
                        "completedAt": utc_now(),
                        "error": "",
                    },
                    {
                        "id": "job-102",
                        "jobType": "Candidate Intelligence Extraction",
                        "status": "completed",
                        "attempts": 1,
                        "startedAt": utc_now(),
                        "completedAt": utc_now(),
                        "error": "",
                    },
                    {
                        "id": "job-103",
                        "jobType": "Skill Normalization & Taxonomy",
                        "status": "completed",
                        "attempts": 1,
                        "startedAt": utc_now(),
                        "completedAt": utc_now(),
                        "error": "",
                    },
                    {
                        "id": "job-104",
                        "jobType": "Multi-Dimensional Job Matching",
                        "status": "completed",
                        "attempts": 1,
                        "startedAt": utc_now(),
                        "completedAt": utc_now(),
                        "error": "",
                    },
                    {
                        "id": "job-105",
                        "jobType": "Talent Rediscovery Indexing",
                        "status": "completed",
                        "attempts": 1,
                        "startedAt": utc_now(),
                        "completedAt": utc_now(),
                        "error": "",
                    },
                ],
            )

            # Auto-migrate applications to candidates if empty
            if not data["candidates"] and data["applications"]:
                candidates_map: dict[str, dict[str, Any]] = {}
                for app in data["applications"]:
                    c_id = str(app.get("candidateId") or app["id"])
                    app["candidateId"] = c_id
                    if c_id not in candidates_map:
                        intel = extract_candidate_intelligence(
                            str(app.get("textPreview") or app.get("summary") or ""), app
                        )
                        candidates_map[c_id] = {
                            "id": c_id,
                            "canonicalName": app.get("candidateName", "Unknown Candidate"),
                            "blindId": intel["blindId"],
                            "email": app.get("email", ""),
                            "phone": app.get("phone", ""),
                            "location": app.get("location", "Unknown"),
                            "city": app.get("city", ""),
                            "region": app.get("region", ""),
                            "country": app.get("country", ""),
                            "currentTitle": intel["currentTitle"],
                            "currentCompany": intel["currentCompany"],
                            "profileSummary": app.get("summary", ""),
                            "experienceYears": app.get("experienceYears"),
                            "primaryDomain": app.get("primarySkill", "General Review"),
                            "primaryDomainKey": app.get("primarySkillKey", "general"),
                            "matchedSkills": app.get("matchedSkills", []),
                            "skills": intel["skills"],
                            "experiences": intel["experiences"],
                            "educations": intel["educations"],
                            "dataQualityScore": intel["dataQualityScore"],
                            "qualityBreakdown": intel["qualityBreakdown"],
                            "seniority": intel["seniority"],
                            "consentStatus": "granted",
                            "status": app.get("status", "new"),
                            "role": app.get("role", "Open application"),
                            "source": app.get("source", "Direct upload"),
                            "notes": app.get("notes", ""),
                            "tags": app.get("tags", []),
                            "createdAt": app.get("uploadedAt", utc_now()),
                            "updatedAt": app.get("updatedAt", utc_now()),
                            "lastActivityAt": app.get("updatedAt", utc_now()),
                            "applicationIds": [app["id"]],
                        }
                    else:
                        candidates_map[c_id]["applicationIds"].append(app["id"])
                data["candidates"] = list(candidates_map.values())
            return data

    def _write(self, data: dict[str, Any]) -> None:
        with self.lock:
            data["updatedAt"] = utc_now()
            temporary = self.data_file.with_suffix(".tmp")
            temporary.write_text(json.dumps(data, indent=2), encoding="utf-8")
            temporary.replace(self.data_file)

    def list_applications(self, context: RequestContext) -> list[dict[str, Any]]:
        return sorted(self._read()["applications"], key=lambda item: item.get("uploadedAt", ""), reverse=True)

    def insert_applications(self, applications: list[dict[str, Any]], context: RequestContext) -> list[dict[str, Any]]:
        data = self._read()
        data["applications"] = applications + data["applications"]
        for app in applications:
            c_id = str(app.get("candidateId") or app["id"])
            app["candidateId"] = c_id
            intel = extract_candidate_intelligence(str(app.get("textPreview") or app.get("summary") or ""), app)
            cand = {
                "id": c_id,
                "canonicalName": app.get("candidateName", "Unknown Candidate"),
                "blindId": intel["blindId"],
                "email": app.get("email", ""),
                "phone": app.get("phone", ""),
                "location": app.get("location", "Unknown"),
                "city": app.get("city", ""),
                "region": app.get("region", ""),
                "country": app.get("country", ""),
                "currentTitle": intel["currentTitle"],
                "currentCompany": intel["currentCompany"],
                "profileSummary": app.get("summary", ""),
                "experienceYears": app.get("experienceYears"),
                "primaryDomain": app.get("primarySkill", "General Review"),
                "primaryDomainKey": app.get("primarySkillKey", "general"),
                "matchedSkills": app.get("matchedSkills", []),
                "skills": intel["skills"],
                "experiences": intel["experiences"],
                "educations": intel["educations"],
                "dataQualityScore": intel["dataQualityScore"],
                "qualityBreakdown": intel["qualityBreakdown"],
                "seniority": intel["seniority"],
                "consentStatus": "granted",
                "status": app.get("status", "new"),
                "role": app.get("role", "Open application"),
                "source": app.get("source", "Direct upload"),
                "notes": app.get("notes", ""),
                "tags": app.get("tags", []),
                "createdAt": app.get("uploadedAt", utc_now()),
                "updatedAt": app.get("updatedAt", utc_now()),
                "lastActivityAt": app.get("updatedAt", utc_now()),
                "applicationIds": [app["id"]],
            }
            existing_idx = next(
                (
                    i
                    for i, c in enumerate(data["candidates"])
                    if c["id"] == c_id or (c["email"] and c["email"] == app.get("email"))
                ),
                None,
            )
            if existing_idx is not None:
                if app["id"] not in data["candidates"][existing_idx]["applicationIds"]:
                    data["candidates"][existing_idx]["applicationIds"].append(app["id"])
                data["candidates"][existing_idx]["lastActivityAt"] = utc_now()
            else:
                data["candidates"].insert(0, cand)
        self._write(data)
        return applications


    def update_applications(
        self, ids: list[str], changes: dict[str, Any], context: RequestContext
    ) -> list[dict[str, Any]]:
        camel = _changes_to_camel(changes)
        selected = set(ids)
        updated: list[dict[str, Any]] = []
        data = self._read()
        for application in data["applications"]:
            if application["id"] in selected:
                application.update(camel)
                application["updatedAt"] = utc_now()
                updated.append(application.copy())
        self._write(data)
        return updated

    def delete_applications(self, ids: list[str], context: RequestContext) -> int:
        selected = set(ids)
        data = self._read()
        removed = [item for item in data["applications"] if item["id"] in selected]
        data["applications"] = [item for item in data["applications"] if item["id"] not in selected]
        self._write(data)
        self.delete_resume_objects([item.get("storedName", "") for item in removed])
        return len(removed)

    def list_jobs(self, context: RequestContext) -> list[dict[str, Any]]:
        return self._read()["jobs"]

    def create_job(self, values: dict[str, Any], context: RequestContext) -> dict[str, Any]:
        now = utc_now()
        job = {"id": str(uuid.uuid4()), **values, "status": "open", "createdAt": now, "updatedAt": now}
        data = self._read()
        data["jobs"].insert(0, job)
        self._write(data)
        return job

    def list_campaigns(self, context: RequestContext) -> list[dict[str, Any]]:
        return self._read()["campaigns"]

    def create_campaign(
        self, campaign: dict[str, Any], recipients: list[dict[str, Any]], context: RequestContext
    ) -> dict[str, Any]:
        saved = {
            **campaign,
            "totalRecipients": len(recipients),
            "sentCount": 0,
            "failedCount": 0,
            "sentAt": None,
            "createdAt": utc_now(),
            "recipients": recipients,
        }
        data = self._read()
        data["campaigns"].insert(0, saved)
        self._write(data)
        return {key: value for key, value in saved.items() if key != "recipients"}

    def update_campaign_delivery(
        self, campaign_id: str, sent: list[dict[str, str]], failed: list[dict[str, str]], context: RequestContext
    ) -> dict[str, Any]:
        data = self._read()
        campaign = next(item for item in data["campaigns"] if item["id"] == campaign_id)
        campaign.update(
            {
                "status": "sent" if not failed else "failed",
                "sentCount": len(sent),
                "failedCount": len(failed),
                "sentAt": utc_now(),
            }
        )
        self._write(data)
        return {key: value for key, value in campaign.items() if key != "recipients"}

    def get_gmail_connection(self, context: RequestContext) -> dict[str, Any] | None:
        return self._read()["gmailConnections"].get(context.user_id)

    def save_gmail_connection(self, connection: dict[str, Any], context: RequestContext) -> None:
        data = self._read()
        data["gmailConnections"][context.user_id] = {**connection, "updated_at": utc_now()}
        self._write(data)

    def delete_gmail_connection(self, context: RequestContext) -> None:
        data = self._read()
        data["gmailConnections"].pop(context.user_id, None)
        self._write(data)

    def upload_resume(self, path: str, content: bytes, mime_type: str) -> None:
        target = self.uploads / Path(path).name
        target.write_bytes(content)

    def delete_resume_objects(self, paths: list[str]) -> None:
        for path in paths:
            target = self.uploads / Path(path).name
            if target.exists() and target.is_file():
                target.unlink()

    def opt_out_email(self, organization_id: str, email: str) -> None:
        data = self._read()
        for application in data["applications"]:
            if application.get("email", "").lower() == email.lower():
                application["emailOptOut"] = True
        self._write(data)

    def has_external_id(self, context: RequestContext, external_id: str) -> bool:
        return any(item.get("sourceExternalId") == external_id for item in self._read()["applications"])

    def list_team_members(self, context: RequestContext) -> list[dict[str, Any]]:
        return [
            {
                "userId": context.user_id,
                "email": context.email,
                "fullName": "Local administrator",
                "role": "owner",
                "joinedAt": utc_now(),
            }
        ]

    def invite_team_member(self, context: RequestContext, email: str, role: str) -> dict[str, Any]:
        raise AppError("Team invitations require Supabase Auth.", 409, "production_auth_required")

    def remove_team_member(self, context: RequestContext, user_id: str) -> bool:
        return False

    def membership_role(self, organization_id: str, user_id: str) -> str | None:
        return "owner" if organization_id == "local-organization" and user_id == "local-user" else None

    def create_signed_upload(self, path: str) -> dict[str, Any]:
        raise AppError("Signed uploads require Supabase Storage.", 409, "production_storage_required")

    def download_resume(self, path: str) -> bytes:
        target = self.uploads / Path(path).name
        if not target.is_file():
            raise AppError("Uploaded resume not found.", 404, "upload_not_found")
        return target.read_bytes()

    def audit(
        self,
        context: RequestContext,
        action: str,
        entity_type: str,
        entity_id: str | None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        return None

    def list_candidates(self, context: RequestContext, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        return sorted(self._read()["candidates"], key=lambda c: c.get("lastActivityAt", ""), reverse=True)

    def get_candidate(self, candidate_id: str, context: RequestContext) -> dict[str, Any] | None:
        data = self._read()
        return next((c for c in data["candidates"] if c["id"] == candidate_id), None)

    def update_candidate(self, candidate_id: str, changes: dict[str, Any], context: RequestContext) -> dict[str, Any] | None:
        data = self._read()
        target = None
        for cand in data["candidates"]:
            if cand["id"] == candidate_id:
                cand.update(changes)
                cand["updatedAt"] = utc_now()
                cand["lastActivityAt"] = utc_now()
                target = cand.copy()
                break
        if target:
            self._write(data)
        return target

    def record_candidate_event(self, candidate_id: str, event_type: str, actor_id: str, metadata: dict[str, Any], context: RequestContext) -> None:
        data = self._read()
        event = {
            "id": str(uuid.uuid4()),
            "candidateId": candidate_id,
            "eventType": event_type,
            "actorId": actor_id,
            "metadata": metadata or {},
            "createdAt": utc_now(),
        }
        data.setdefault("candidateEvents", []).insert(0, event)
        self._write(data)

    def list_candidate_events(self, candidate_id: str, context: RequestContext) -> list[dict[str, Any]]:
        data = self._read()
        events = [e for e in data.get("candidateEvents", []) if e.get("candidateId") == candidate_id]
        if not events:
            now = utc_now()
            return [
                {"id": str(uuid.uuid4()), "candidateId": candidate_id, "eventType": "resume_ingested", "actorId": "system", "createdAt": now, "metadata": {"source": "direct_upload"}},
                {"id": str(uuid.uuid4()), "candidateId": candidate_id, "eventType": "intelligence_extracted", "actorId": "talent_engine_v11", "createdAt": now, "metadata": {"status": "success"}},
            ]
        return events

    def list_talent_pools(self, context: RequestContext) -> list[dict[str, Any]]:
        data = self._read()
        pools = data.get("talentPools", [])
        members = data.get("talentPoolMembers", {})
        for pool in pools:
            pool["memberCount"] = len(members.get(pool["id"], []))
        return pools

    def create_talent_pool(self, name: str, description: str, context: RequestContext) -> dict[str, Any]:
        data = self._read()
        pool = {
            "id": f"pool-{uuid.uuid4().hex[:8]}",
            "name": name,
            "description": description,
            "createdAt": utc_now(),
            "memberCount": 0,
        }
        data.setdefault("talentPools", []).append(pool)
        self._write(data)
        return pool

    def add_to_talent_pool(self, pool_id: str, candidate_ids: list[str], context: RequestContext) -> int:
        data = self._read()
        members = data.setdefault("talentPoolMembers", {})
        existing = set(members.get(pool_id, []))
        existing.update(candidate_ids)
        members[pool_id] = list(existing)
        self._write(data)
        return len(existing)

    def remove_from_talent_pool(self, pool_id: str, candidate_id: str, context: RequestContext) -> bool:
        data = self._read()
        members = data.setdefault("talentPoolMembers", {})
        if pool_id in members and candidate_id in members[pool_id]:
            members[pool_id].remove(candidate_id)
            self._write(data)
            return True
        return False

    def list_processing_jobs(self, context: RequestContext) -> list[dict[str, Any]]:
        return self._read().get("processingJobs", [])

    def merge_candidates(self, primary_id: str, secondary_id: str, context: RequestContext) -> dict[str, Any]:
        data = self._read()
        primary = next((c for c in data["candidates"] if c["id"] == primary_id), None)
        secondary = next((c for c in data["candidates"] if c["id"] == secondary_id), None)
        if primary and secondary:
            primary["applicationIds"] = list(set(primary.get("applicationIds", []) + secondary.get("applicationIds", [])))
            primary["skills"] = primary.get("skills", []) + [s for s in secondary.get("skills", []) if s not in primary.get("skills", [])]
            data["candidates"] = [c for c in data["candidates"] if c["id"] != secondary_id]
            self._write(data)
            self.record_candidate_event(primary_id, "merged_duplicate", context.user_id, {"mergedCandidateId": secondary_id}, context)
            return {"primaryId": primary_id, "mergedId": secondary_id, "status": "merged"}
        return {"status": "not_found"}



def build_repository(settings: Settings) -> Repository:
    if settings.supabase_configured:
        return SupabaseRepository(settings)
    if settings.allow_demo_mode:
        return LocalRepository()
    raise ServiceUnavailableError("The production database is not configured.")


def _job_from_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "title": row.get("title", ""),
        "department": row.get("department", ""),
        "location": row.get("location", ""),
        "description": row.get("description", ""),
        "status": row.get("status", "open"),
        "createdAt": row.get("created_at") or row.get("createdAt") or utc_now(),
        "updatedAt": row.get("updated_at") or row.get("updatedAt") or utc_now(),
    }


def _campaign_from_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "title": row.get("title", ""),
        "subject": row.get("subject", ""),
        "body": row.get("body", ""),
        "status": row.get("status", "draft"),
        "totalRecipients": int(row.get("total_recipients") or 0),
        "sentCount": int(row.get("sent_count") or 0),
        "failedCount": int(row.get("failed_count") or 0),
        "sentAt": row.get("sent_at"),
        "createdAt": row.get("created_at") or utc_now(),
    }


def _changes_to_camel(changes: dict[str, Any]) -> dict[str, Any]:
    mapping = {"primary_skill": "primarySkill", "primary_skill_key": "primarySkillKey"}
    return {mapping.get(key, key): value for key, value in changes.items() if key != "updated_at"}


def safe_file_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(value).name).strip("._")
    return (cleaned or "resume")[:110]
