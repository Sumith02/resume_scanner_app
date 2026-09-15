from __future__ import annotations

import html
import time
from typing import Any

import httpx

from .config import Settings
from .crypto import SignedState
from .errors import AppError


class EmailService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.unsubscribe_signer = SignedState(settings.oauth_state_secret, max_age_seconds=366 * 24 * 60 * 60)

    def deliver_campaign(
        self,
        campaign_id: str,
        subject: str,
        body: str,
        organization_id: str,
        recipients: list[dict[str, Any]],
    ) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
        if not self.settings.email_configured:
            return [], []

        sent: list[dict[str, str]] = []
        failed: list[dict[str, str]] = []
        for offset in range(0, len(recipients), 100):
            batch = recipients[offset : offset + 100]
            payload = [
                {
                    "from": self.settings.mail_from,
                    "to": [recipient["email"]],
                    "subject": subject,
                    "html": self._render_body(body, organization_id, recipient),
                    "headers": {"List-Unsubscribe": f"<{self._unsubscribe_url(organization_id, recipient['email'])}>"},
                    "tags": [
                        {"name": "campaign_id", "value": campaign_id},
                        {"name": "application_id", "value": recipient["applicationId"]},
                    ],
                }
                for recipient in batch
            ]
            try:
                response = self._send_batch(payload, campaign_id, offset // 100)
                response.raise_for_status()
                response_data = response.json().get("data", [])
                for index, recipient in enumerate(batch):
                    provider_id = response_data[index].get("id", "") if index < len(response_data) else ""
                    sent.append({"email": recipient["email"], "providerMessageId": provider_id})
            except (httpx.HTTPError, ValueError) as error:
                message = _provider_error(error)
                failed.extend({"email": recipient["email"], "message": message} for recipient in batch)
        return sent, failed

    def _send_batch(self, payload: list[dict[str, Any]], campaign_id: str, batch_number: int) -> httpx.Response:
        response: httpx.Response | None = None
        for attempt in range(3):
            response = httpx.post(
                "https://api.resend.com/emails/batch",
                headers={
                    "Authorization": f"Bearer {self.settings.resend_api_key}",
                    "Content-Type": "application/json",
                    "Idempotency-Key": f"campaign-{campaign_id}-batch-{batch_number}",
                },
                json=payload,
                timeout=30,
            )
            if response.status_code != 429:
                return response
            retry_after = min(float(response.headers.get("retry-after", "1")), 5)
            time.sleep(retry_after * (attempt + 1))
        assert response is not None
        return response

    def verify_unsubscribe(self, token: str) -> tuple[str, str]:
        payload = self.unsubscribe_signer.verify(token)
        organization_id = str(payload.get("organizationId", ""))
        email = str(payload.get("email", ""))
        if not organization_id or not email:
            raise AppError("Invalid unsubscribe link.", 400, "invalid_unsubscribe")
        return organization_id, email

    def _unsubscribe_url(self, organization_id: str, email: str) -> str:
        token = self.unsubscribe_signer.create({"organizationId": organization_id, "email": email})
        return f"{self.settings.app_origin}/api/email/unsubscribe?token={token}"

    def _render_body(self, template: str, organization_id: str, recipient: dict[str, Any]) -> str:
        safe_body = html.escape(template)
        safe_body = safe_body.replace("{{name}}", html.escape(recipient.get("candidateName") or "there"))
        safe_body = safe_body.replace("{{email}}", html.escape(recipient["email"]))
        safe_body = safe_body.replace("\n", "<br>")
        unsubscribe_url = html.escape(self._unsubscribe_url(organization_id, recipient["email"]), quote=True)
        return (
            '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18212f">'
            f"{safe_body}"
            '<p style="margin-top:32px;font-size:12px;color:#667085">'
            f'<a href="{unsubscribe_url}">Unsubscribe from future opening notifications</a>'
            "</p></div>"
        )


def _provider_error(error: Exception) -> str:
    if isinstance(error, httpx.HTTPStatusError):
        try:
            payload = error.response.json()
            return str(payload.get("message") or payload.get("name") or "Email provider rejected the batch")[:1000]
        except ValueError:
            return f"Email provider returned {error.response.status_code}"
    return "Email provider could not be reached"
