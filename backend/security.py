from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt

from backend.config import JWT_ALGORITHM, JWT_EXPIRES_MINUTES, JWT_SECRET

_PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, org_id: int | None, role: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "org_id": org_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRES_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def generate_invite_token() -> str:
    return secrets.token_urlsafe(32)


def generate_temp_password() -> str:
    """Human-typable temporary password emailed to a newly provisioned user."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
    core = "".join(secrets.choice(alphabet) for _ in range(10))
    return f"Nx-{core}"


def create_oauth_state(org_id: int, user_id: int) -> str:
    """Short-lived signed state for the Gmail OAuth redirect round-trip."""
    now = datetime.now(UTC)
    payload = {
        "org_id": org_id,
        "user_id": user_id,
        "purpose": "gmail_oauth",
        "iat": now,
        "exp": now + timedelta(minutes=15),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_oauth_state(token: str) -> dict:
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    if payload.get("purpose") != "gmail_oauth":
        raise ValueError("Invalid state token")
    return payload


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def invite_expiry() -> datetime:
    from backend.config import INVITE_EXPIRES_HOURS

    return datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=INVITE_EXPIRES_HOURS)