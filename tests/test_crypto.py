import time

import pytest

from backend.crypto import SignedState, TokenCipher
from backend.errors import AppError


def test_token_cipher_round_trip() -> None:
    cipher = TokenCipher("a-long-production-secret-that-is-not-committed")
    encrypted = cipher.encrypt("refresh-token")
    assert encrypted != "refresh-token"
    assert cipher.decrypt(encrypted) == "refresh-token"


def test_signed_state_rejects_tampering() -> None:
    state = SignedState("state-signing-secret")
    token = state.create({"userId": "user-1"})
    with pytest.raises(AppError):
        state.verify(token + "x")


def test_signed_state_rejects_expiration(monkeypatch: pytest.MonkeyPatch) -> None:
    state = SignedState("state-signing-secret", max_age_seconds=5)
    token = state.create({"userId": "user-1"})
    monkeypatch.setattr(time, "time", lambda: 9_999_999_999)
    with pytest.raises(AppError):
        state.verify(token)
