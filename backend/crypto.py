"""Symmetric encryption for stored OAuth tokens.

Uses Fernet (AES-128-CBC + HMAC) with a key derived from the configured secret.
Tokens are never stored or logged in plaintext.
"""
from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken

from backend.config import JWT_SECRET


def _key() -> bytes:
    secret = os.getenv("TOKEN_ENCRYPTION_KEY", JWT_SECRET)
    digest = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


_fernet = Fernet(_key())


def encrypt(value: str | None) -> str | None:
    if not value:
        return None
    return _fernet.encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet.decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return None