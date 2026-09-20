import os

try:  # optional: load a local .env for development
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - dotenv is optional in production
    pass

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./nexerra.db",
)

JWT_SECRET = os.getenv(
    "JWT_SECRET",
    "nexerra-dev-secret-change-me-before-any-real-deployment",
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "1440"))

INVITE_EXPIRES_HOURS = int(os.getenv("INVITE_EXPIRES_HOURS", "72"))

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")

BOOTSTRAP_EMAIL = os.getenv("BOOTSTRAP_EMAIL", "admin@nexerra.io")
BOOTSTRAP_PASSWORD = os.getenv("BOOTSTRAP_PASSWORD", "Admin@12345")
BOOTSTRAP_NAME = os.getenv("BOOTSTRAP_NAME", "Platform Administrator")

MASTER_ADMIN_PERMISSION = "platform:manage"

MAX_RESUME_BYTES = int(os.getenv("MAX_RESUME_BYTES", str(10 * 1024 * 1024)))

# ---------------------------------------------------------------------------
# Email ingestion (Gmail OAuth) — Phase 4
# ---------------------------------------------------------------------------
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:4174/api/email/gmail/callback"
)
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
]

# When Google OAuth isn't configured the Gmail connector runs in demo mode,
# reading resume files dropped into this local inbox directory.
DEMO_INBOX_DIR = os.getenv("DEMO_INBOX_DIR", "./uploads/inbox")

# ---------------------------------------------------------------------------
# Outbound email — Phase 4. Falls back to a mock provider when unset.
# ---------------------------------------------------------------------------
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "no-reply@nexerra.io")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")

PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "http://localhost:4174")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5174")