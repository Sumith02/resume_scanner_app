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

    def send_welcome_account_email(
        self,
        email: str,
        full_name: str,
        temporary_password: str,
        role: str,
        organization_name: str,
    ) -> tuple[bool, str]:
        """Dispatches account confirmation and temporary password to a newly provisioned user."""
        if not self.settings.email_configured:
            return False, "Email service is unconfigured on server (missing RESEND_API_KEY or SMTP credentials)."

        display_name = full_name.strip() or email.split("@")[0].title()
        role_label = role.replace("_", " ").title()
        subject = f"Your {organization_name} Account Credentials (Temporary Password)"
        html_content = (
            f"<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 8px;'>"
            f"<div style='margin-bottom: 20px;'>"
            f"<strong style='font-size: 20px; color: #0f172a;'>RESUME SCANNER</strong>"
            f"</div>"
            f"<p>Hello <strong>{html.escape(display_name)}</strong>,</p>"
            f"<p>Your account has been created by an administrator on <strong>{html.escape(organization_name)}</strong> with the role of <strong>{html.escape(role_label)}</strong>.</p>"
            f"<div style='background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0;'>"
            f"<div style='margin-bottom: 8px;'><strong>Portal URL:</strong> <a href='{html.escape(self.settings.app_origin)}'>{html.escape(self.settings.app_origin)}</a></div>"
            f"<div style='margin-bottom: 8px;'><strong>Login Email:</strong> {html.escape(email)}</div>"
            f"<div><strong>Temporary Password:</strong> <code style='background: #e2e8f0; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 15px; letter-spacing: 1px;'>{html.escape(temporary_password)}</code></div>"
            f"</div>"
            f"<div style='background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 14px; margin-bottom: 20px; font-size: 13px; color: #1e40af; border-radius: 4px;'>"
            f"<strong>Security Requirement:</strong> Because this is a temporary password, you will be required to create your own secure, permanent password immediately upon your first login."
            f"</div>"
            f"<p style='font-size: 13px; color: #64748b;'>If you have questions, please reach out directly to your organization administrator.</p>"
            f"<hr style='border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;' />"
            f"<p style='font-size: 11px; color: #94a3b8;'>© 2026 Resume Scanner. Automated Account Security.</p>"
            f"</div>"
        )

        # 1. Try SMTP if configured
        if self.settings.smtp_configured:
            try:
                import smtplib
                from email.mime.multipart import MIMEMultipart
                from email.mime.text import MIMEText

                sender = self.settings.smtp_from or self.settings.smtp_user or self.settings.mail_from
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = sender
                msg["To"] = email
                msg.attach(MIMEText(html_content, "html"))

                port = self.settings.smtp_port or 587
                if port == 465:
                    with smtplib.SMTP_SSL(self.settings.smtp_host, port, timeout=12) as server:
                        if self.settings.smtp_user and self.settings.smtp_password:
                            server.login(self.settings.smtp_user, self.settings.smtp_password)
                        server.sendmail(sender, [email], msg.as_string())
                else:
                    with smtplib.SMTP(self.settings.smtp_host, port, timeout=12) as server:
                        server.starttls()
                        if self.settings.smtp_user and self.settings.smtp_password:
                            server.login(self.settings.smtp_user, self.settings.smtp_password)
                        server.sendmail(sender, [email], msg.as_string())
                return True, "Email sent successfully via SMTP."
            except Exception as exc:
                if not (self.settings.resend_api_key and self.settings.mail_from):
                    return False, f"SMTP delivery failed: {exc}"

        # 2. Try Resend if configured
        if self.settings.resend_api_key and self.settings.mail_from:
            try:
                response = httpx.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.settings.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": self.settings.mail_from,
                        "to": [email],
                        "subject": subject,
                        "html": html_content,
                    },
                    timeout=15,
                )
                response.raise_for_status()
                return True, "Email sent successfully via Resend."
            except Exception as exc:
                return False, f"Resend API delivery failed: {exc}"

        return False, "No active email provider available."

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
