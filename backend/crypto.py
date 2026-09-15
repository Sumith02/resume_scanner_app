from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from cryptography.fernet import Fernet, InvalidToken

from .errors import AppError, ServiceUnavailableError


class TokenCipher:
    def __init__(self, secret: str) -> None:
        self.enabled = bool(secret)
        key = (
            base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
            if secret
            else Fernet.generate_key()
        )
        self.fernet = Fernet(key)

    def encrypt(self, value: str) -> str:
        if not self.enabled:
            raise ServiceUnavailableError("Token encryption is not configured.")
        return self.fernet.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt(self, value: str) -> str:
        if not self.enabled:
            raise ServiceUnavailableError("Token encryption is not configured.")
        try:
            return self.fernet.decrypt(value.encode("ascii")).decode("utf-8")
        except InvalidToken as error:
            raise AppError(
                "The Gmail connection is unreadable. Reconnect Gmail.", 409, "gmail_reconnect_required"
            ) from error


class SignedState:
    def __init__(self, secret: str, max_age_seconds: int = 600) -> None:
        self.secret = secret.encode("utf-8")
        self.max_age_seconds = max_age_seconds

    def create(self, payload: dict[str, object]) -> str:
        if not self.secret:
            raise ServiceUnavailableError("OAuth state signing is not configured.")
        body = {**payload, "issuedAt": int(time.time())}
        encoded = _encode(json.dumps(body, separators=(",", ":")).encode("utf-8"))
        signature = _encode(hmac.new(self.secret, encoded.encode("ascii"), hashlib.sha256).digest())
        return f"{encoded}.{signature}"

    def verify(self, state: str) -> dict[str, object]:
        try:
            encoded, signature = state.split(".", 1)
            expected = _encode(hmac.new(self.secret, encoded.encode("ascii"), hashlib.sha256).digest())
            if not hmac.compare_digest(signature, expected):
                raise ValueError("signature")
            payload = json.loads(_decode(encoded).decode("utf-8"))
            issued_at = int(payload["issuedAt"])
            if abs(int(time.time()) - issued_at) > self.max_age_seconds:
                raise ValueError("expired")
            return payload
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            raise AppError(
                "The Gmail authorization request is invalid or expired.", 400, "invalid_oauth_state"
            ) from error


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
