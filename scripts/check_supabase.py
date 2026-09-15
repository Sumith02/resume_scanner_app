from __future__ import annotations

import argparse
from pathlib import Path

import httpx
from dotenv import dotenv_values


def main() -> None:
    parser = argparse.ArgumentParser(description="Check ResumeFlow's Supabase services without printing credentials.")
    parser.add_argument("env_file", type=Path, help="Path to an environment file")
    args = parser.parse_args()
    values = dotenv_values(args.env_file)
    url = str(
        values.get("SUPABASE_URL")
        or values.get("NEXT_PUBLIC_SUPABASE_URL")
        or values.get("VITE_SUPABASE_URL")
        or ""
    ).rstrip("/")
    public_key = str(
        values.get("SUPABASE_PUBLISHABLE_KEY")
        or values.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or values.get("VITE_SUPABASE_ANON_KEY")
        or ""
    )
    secret_key = str(values.get("SUPABASE_SECRET_KEY") or values.get("SUPABASE_SERVICE_ROLE_KEY") or "")
    print(
        f"URL configured: {bool(url)}; public key configured: {bool(public_key)}; "
        f"server key configured: {bool(secret_key)}"
    )
    checks = [
        ("Auth service", "/auth/v1/health", public_key),
        ("Base database schema", "/rest/v1/applications?select=id&limit=1", secret_key),
        (
            "Hardened database schema",
            "/rest/v1/applications?select=id,file_path,file_checksum,source_external_id,email_opt_out&limit=1",
            secret_key,
        ),
        ("Private resume bucket", "/storage/v1/bucket/resumes", secret_key),
    ]
    for label, endpoint, key in checks:
        try:
            response = httpx.get(
                url + endpoint,
                headers={"apikey": key, "Authorization": f"Bearer {key}"},
                timeout=15,
            )
            detail = _error_detail(response)
            print(f"{label}: HTTP {response.status_code}" + (f" ({detail})" if detail else ""))
        except httpx.HTTPError as error:
            print(f"{label}: request failed ({type(error).__name__})")


def _error_detail(response: httpx.Response) -> str:
    if not response.is_error:
        return ""
    try:
        payload = response.json()
        return str(payload.get("message") or payload.get("error") or "")[:180]
    except ValueError:
        return response.text[:180]


if __name__ == "__main__":
    main()
