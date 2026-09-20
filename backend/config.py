import os

try:  # optional: load a local .env for development
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - dotenv is optional in production
    pass

def _is_serverless_or_readonly() -> bool:
    if os.getenv("VERCEL") or os.getenv("LAMBDA_TASK_ROOT") or os.getenv("AWS_LAMBDA_FUNCTION_NAME") or os.getenv("AWS_EXECUTION_ENV"):
        return True
    try:
        test_file = "./.write_test"
        with open(test_file, "w") as f:
            f.write("1")
        os.remove(test_file)
        return False
    except OSError:
        return True


IS_VERCEL = _is_serverless_or_readonly()

_default_db = "sqlite:////tmp/nexerra.db" if IS_VERCEL else "sqlite:///./nexerra.db"
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    _default_db,
)

# Normalize postgres URL if needed (SQLAlchemy 2.0 requires postgresql+psycopg:// or postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+psycopg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

JWT_SECRET = os.getenv(
    "JWT_SECRET",
    "nexerra-dev-secret-change-me-before-any-real-deployment",
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "1440"))

INVITE_EXPIRES_HOURS = int(os.getenv("INVITE_EXPIRES_HOURS", "72"))

_default_upload_dir = "/tmp/uploads" if IS_VERCEL else "./uploads"
UPLOAD_DIR = os.getenv("UPLOAD_DIR", _default_upload_dir)

BOOTSTRAP_EMAIL = os.getenv("BOOTSTRAP_EMAIL", "admin@nexerra.io")
BOOTSTRAP_PASSWORD = os.getenv("BOOTSTRAP_PASSWORD", "Admin@12345")
BOOTSTRAP_NAME = os.getenv("BOOTSTRAP_NAME", "Platform Administrator")

MASTER_ADMIN_PERMISSION = "platform:manage"

MAX_RESUME_BYTES = int(os.getenv("MAX_RESUME_BYTES", str(10 * 1024 * 1024)))

# ---------------------------------------------------------------------------
# Email ingestion (Gmail OAuth) — Phase 4
# ---------------------------------------------------------------------------
_vercel_domain = (
    os.getenv("VERCEL_PROJECT_PRODUCTION_URL")
    or os.getenv("VERCEL_URL")
    or "resume-scanner-app-two.vercel.app"
)
_default_api_url = f"https://{_vercel_domain}" if IS_VERCEL else "http://localhost:4174"
_default_frontend_url = f"https://{_vercel_domain}" if IS_VERCEL else "http://localhost:5174"

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", f"{_default_api_url}/api/email/gmail/callback"
)
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
]

# When Google OAuth isn't configured the Gmail connector runs in demo mode,
# reading resume files dropped into this local inbox directory.
_default_inbox_dir = "/tmp/uploads/inbox" if IS_VERCEL else "./uploads/inbox"
DEMO_INBOX_DIR = os.getenv("DEMO_INBOX_DIR", _default_inbox_dir)

# ---------------------------------------------------------------------------
# Outbound email — Phase 4. Falls back to a mock provider when unset.
# ---------------------------------------------------------------------------
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "no-reply@nexerra.io")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")

PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", _default_api_url)
FRONTEND_URL = os.getenv("FRONTEND_URL", _default_frontend_url)