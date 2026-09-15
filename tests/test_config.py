import pytest

from backend.config import Settings
from backend.errors import ServiceUnavailableError
from backend.repository import build_repository


def test_production_configuration_fails_closed() -> None:
    settings = Settings(
        environment="production",
        app_origin="https://app.example.com",
        supabase_url="",
        supabase_public_key="",
        supabase_secret_key="",
        auth_required=True,
        allow_demo_mode=False,
        google_client_id="",
        google_client_secret="",
        google_redirect_uri="",
        oauth_state_secret="",
        token_encryption_key="",
        resend_api_key="",
        mail_from="",
    )

    with pytest.raises(ServiceUnavailableError):
        build_repository(settings)


def test_short_encryption_secrets_do_not_enable_gmail() -> None:
    settings = Settings(
        environment="production",
        app_origin="https://app.example.com",
        supabase_url="https://example.supabase.co",
        supabase_public_key="public",
        supabase_secret_key="secret",
        auth_required=True,
        allow_demo_mode=False,
        google_client_id="client",
        google_client_secret="client-secret",
        google_redirect_uri="https://app.example.com/api/integrations/gmail/callback",
        oauth_state_secret="short",
        token_encryption_key="short",
        resend_api_key="",
        mail_from="",
    )

    assert settings.gmail_configured is False
