from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv(".env.local", override=False)
load_dotenv(".env", override=False)


def _first(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def _boolean(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True, slots=True)
class Settings:
    environment: str
    app_origin: str
    supabase_url: str
    supabase_public_key: str
    supabase_secret_key: str
    auth_required: bool
    allow_demo_mode: bool
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str
    oauth_state_secret: str
    token_encryption_key: str
    resend_api_key: str
    mail_from: str
    max_upload_bytes: int = 14 * 1024 * 1024
    max_upload_files: int = 100
    storage_bucket: str = "resumes"

    @property
    def production(self) -> bool:
        return self.environment == "production"

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_public_key and self.supabase_secret_key)

    @property
    def gmail_configured(self) -> bool:
        return bool(
            self.google_client_id
            and self.google_client_secret
            and self.google_redirect_uri
            and self.oauth_state_secret
            and self.token_encryption_key
            and len(self.oauth_state_secret) >= 32
            and len(self.token_encryption_key) >= 32
        )

    @property
    def email_configured(self) -> bool:
        return bool(self.resend_api_key and self.mail_from)

    def validate_runtime(self) -> list[str]:
        errors: list[str] = []
        if self.production and not self.allow_demo_mode:
            if not self.supabase_configured:
                errors.append("Supabase is not fully configured")
            if not self.auth_required:
                errors.append("AUTH_REQUIRED must be enabled in production")
            if not self.app_origin.startswith("https://"):
                errors.append("APP_ORIGIN must use HTTPS in production")
        if self.production and self.oauth_state_secret and len(self.oauth_state_secret) < 32:
            errors.append("RESUMEFLOW_OAUTH_STATE_SECRET must contain at least 32 characters")
        if self.production and self.token_encryption_key and len(self.token_encryption_key) < 32:
            errors.append("TOKEN_ENCRYPTION_KEY must contain at least 32 characters")
        return errors


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    environment = _first("APP_ENV", "VERCEL_ENV") or "development"
    production = environment == "production"
    supabase_url = _first("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL").rstrip("/")
    supabase_public_key = _first(
        "SUPABASE_PUBLIC_KEY",
        "SUPABASE_ANON_KEY",
        "SUPABASE_PUBLISHABLE_KEY",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_ANON_KEY",
        "SUPABASE_KEY",
    )
    supabase_secret_key = _first(
        "SUPABASE_SECRET_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SERVICE_KEY",
    )
    supabase_configured = bool(supabase_url and supabase_public_key and supabase_secret_key)
    vercel_host = _first("VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL")
    default_origin = f"https://{vercel_host}" if vercel_host else "http://localhost:5173"
    default_auth = supabase_configured
    default_demo = not supabase_configured
    return Settings(
        environment=environment,
        app_origin=(_first("APP_ORIGIN") or default_origin).rstrip("/"),
        supabase_url=supabase_url,
        supabase_public_key=supabase_public_key,
        supabase_secret_key=supabase_secret_key,
        auth_required=_boolean("AUTH_REQUIRED", default_auth),
        allow_demo_mode=_boolean("ALLOW_DEMO_MODE", default_demo),
        google_client_id=_first("GOOGLE_CLIENT_ID"),
        google_client_secret=_first("GOOGLE_CLIENT_SECRET"),
        google_redirect_uri=_first("GOOGLE_REDIRECT_URI"),
        oauth_state_secret=_first("RESUMEFLOW_OAUTH_STATE_SECRET"),
        token_encryption_key=_first("TOKEN_ENCRYPTION_KEY"),
        resend_api_key=_first("RESEND_API_KEY"),
        mail_from=_first("MAIL_FROM"),
    )
