from __future__ import annotations

from fastapi import Header

from supabase import ClientOptions, create_client

from .config import Settings
from .errors import AppError, ServiceUnavailableError
from .models import RequestContext
from .repository import LocalRepository, Repository, SupabaseRepository


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
                return RequestContext(
                    user_id="local-user",
                    email="local@resumeflow.dev",
                    organization_id="local-organization",
                    role="owner",
                    authenticated=False,
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
        organization_id, role = self.repository.ensure_workspace(
            str(user.id),
            user.email or "",
            str(metadata.get("full_name") or ""),
        )
        return RequestContext(
            user_id=str(user.id),
            email=user.email or "",
            organization_id=organization_id,
            role=role,
            authenticated=True,
            must_change_password=bool(metadata.get("must_change_password", False)),
        )

    def dependency(self, authorization: str | None = Header(default=None)) -> RequestContext:
        return self.authenticate(authorization)


def require_role(context: RequestContext, *allowed: str) -> None:
    if context.role not in allowed:
        raise AppError("You do not have permission to perform this action.", 403, "permission_denied")


def _bearer_token(value: str | None) -> str:
    if not value:
        return ""
    scheme, _, token = value.partition(" ")
    return token.strip() if scheme.lower() == "bearer" else ""
