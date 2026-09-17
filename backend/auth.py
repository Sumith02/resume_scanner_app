from __future__ import annotations

import hashlib

from fastapi import Header

from supabase import ClientOptions, create_client

from .config import Settings
from .errors import AppError, ServiceUnavailableError
from .models import RequestContext
from .repository import LocalRepository, Repository, SupabaseRepository

MASTER_ADMIN_EMAILS = {"sumithsbhatt@gmail.com"}


def is_master_admin(email: str | None) -> bool:
    if not email:
        return False
    return email.strip().lower() in MASTER_ADMIN_EMAILS


class AuthService:
    def __init__(self, settings: Settings, repository: Repository) -> None:
        self.settings = settings
        self.repository = repository
        self.auth_client = None
        if settings.supabase_configured:
            self.auth_client = create_client(
                settings.supabase_url,
                settings.supabase_public_key,
                options=ClientOptions(auto_refresh_token=False, persist_session=False),
            )

    def authenticate(self, authorization: str | None) -> RequestContext:
        if not self.settings.auth_required:
            if isinstance(self.repository, LocalRepository):
                token = _bearer_token(authorization)
                user_email = "sumithsbhatt@gmail.com"
                user_id = "usr-master"
                org_id = "org-master"
                role = "owner"
                must_change = False

                if token:
                    # Parse user identity from local token format (e.g. 'local:<email>')
                    raw_email = ""
                    if ":" in token:
                        _, _, candidate_email = token.partition(":")
                        if "@" in candidate_email:
                            raw_email = candidate_email.strip().lower()
                    elif "@" in token:
                        raw_email = token.strip().lower()

                    if raw_email:
                        user_email = raw_email
                        if is_master_admin(user_email):
                            user_id = "usr-master"
                            org_id = "org-master"
                            role = "owner"
                            must_change = False
                        else:
                            # Check if user was provisioned by an administrator into an organization
                            stored_user = self.repository.get_user_by_email(user_email)
                            if stored_user:
                                user_id = stored_user.get("userId") or f"usr-{hashlib.md5(user_email.encode('utf-8')).hexdigest()[:8]}"
                                org_id = stored_user.get("organizationId") or f"org-{user_id}"
                                role = stored_user.get("role") or "recruiter"
                                must_change = bool(stored_user.get("mustChangePassword", False))
                            else:
                                # Independent user registration / separate tenant workspace
                                user_hash = hashlib.md5(user_email.encode("utf-8")).hexdigest()[:8]
                                user_id = f"usr-{user_hash}"
                                org_id = f"org-{user_hash}"
                                role = "recruiter"
                                must_change = False

                return RequestContext(
                    user_id=user_id,
                    email=user_email,
                    organization_id=org_id,
                    role=role,
                    authenticated=bool(token),
                    must_change_password=must_change,
                )
            raise ServiceUnavailableError("Authentication must be enabled when using the production database.")

        if not self.auth_client or not isinstance(self.repository, SupabaseRepository):
            raise ServiceUnavailableError("Authentication is unavailable because Supabase is not configured.")

        token = _bearer_token(authorization)
        if not token:
            raise AppError("Sign in before using this workspace.", 401, "authentication_required")

        try:
            response = self.auth_client.auth.get_user(token)
            user = response.user
        except Exception as error:
            raise AppError(
                "Your session is invalid or expired. Please sign in again.", 401, "invalid_session"
            ) from error

        if not user or not user.id:
            raise AppError("Your session is invalid or expired. Please sign in again.", 401, "invalid_session")

        metadata = user.user_metadata or {}
        user_email = (user.email or "").strip().lower()
        organization_id, role = self.repository.ensure_workspace(
            str(user.id),
            user.email or "",
            str(metadata.get("full_name") or ""),
        )
        is_admin = is_master_admin(user_email)

        return RequestContext(
            user_id=str(user.id),
            email=user.email or "",
            organization_id=organization_id,
            role="owner" if is_admin else role,
            authenticated=True,
            must_change_password=bool(metadata.get("must_change_password", False)) and not is_admin,
        )

    def dependency(self, authorization: str | None = Header(default=None)) -> RequestContext:
        return self.authenticate(authorization)


def require_role(context: RequestContext, *allowed: str) -> None:
    if is_master_admin(context.email):
        return
    if context.role not in allowed:
        raise AppError("You do not have permission to perform this action. Administrator privileges required.", 403, "permission_denied")


def _bearer_token(value: str | None) -> str:
    if not value:
        return ""
    scheme, _, token = value.partition(" ")
    return token.strip() if scheme.lower() == "bearer" else ""
