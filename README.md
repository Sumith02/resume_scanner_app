# ResumeFlow HR

ResumeFlow is a multi-tenant resume intake and candidate re-engagement application for HR teams. The frontend is
React/TypeScript. The production API is Python/FastAPI. Supabase provides authentication, PostgreSQL, and private object
storage.

## Production Architecture

- React 19 + TypeScript + Vite frontend
- Python 3.13 + FastAPI API
- Supabase Auth with organization-scoped users and roles
- Supabase PostgreSQL for candidates, jobs, campaigns, connections, and audit events
- Private Supabase Storage bucket for original resumes
- Browser-to-private-storage signed uploads, avoiding serverless request-size limits
- Google OAuth 2.0 with `gmail.readonly` and encrypted refresh tokens
- Resend batch delivery with idempotency keys and unsubscribe links
- Vercel for the frontend and FastAPI function

The API never silently falls back to local files in production. `ALLOW_DEMO_MODE` must be false and the health endpoint
reports a degraded state when required production configuration is absent.

## Local Development

```bash
npm install
python -m pip install -e ".[dev]"
npm run dev
```

Open `http://localhost:5173`. Local development uses `storage/` only when `ALLOW_DEMO_MODE=true` and authentication is
disabled. Put local configuration in `.env.local`; it is ignored by Git and Vercel uploads.

Quality checks:

```bash
python -m ruff check backend tests api
python -m pytest
npm run lint
npm run build
npm audit --audit-level=high
```

## Supabase Setup

1. Create an active Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL Editor.
3. Run `supabase/migrations/002_production_hardening.sql`.
4. In Authentication URL Configuration, set the Site URL to the production Vercel URL.
5. Add the production URL and localhost URL to allowed redirect URLs.
6. Keep the `resumes` bucket private. Migration 002 creates it with MIME type and 14 MB limits.

In production, the browser requests short-lived upload tokens, uploads files directly to the private bucket, and then
asks the API to validate, parse, and record them. Resume bytes and storage credentials are never exposed publicly.

Use the current `sb_publishable_...` and `sb_secret_...` keys when available. The secret key belongs only in the API
environment and must never have a `VITE_` prefix.

## Production Environment

Configure these in Vercel for Production and Preview as appropriate:

```bash
APP_ENV=production
APP_ORIGIN=https://resumescannerapp.vercel.app
AUTH_REQUIRED=true
ALLOW_DEMO_MODE=false

VITE_ENABLE_SUPABASE_AUTH=true
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://resumescannerapp.vercel.app/api/integrations/gmail/callback
RESUMEFLOW_OAUTH_STATE_SECRET=...
TOKEN_ENCRYPTION_KEY=...

RESEND_API_KEY=re_...
MAIL_FROM=ResumeFlow Jobs <jobs@your-verified-domain.com>
```

Generate the two application secrets independently:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

After changing any `VITE_` variable, redeploy because Vite embeds browser-safe values during the build.

## Google OAuth

Create a Web application OAuth client, enable the Gmail API, and register the exact production callback shown above.
ResumeFlow requests read-only Gmail access, stores access and refresh tokens encrypted, refreshes them before expiry, and
retries one request after an unexpected 401. Public use of the restricted Gmail scope may require Google verification.

## Deployment

```bash
vercel --prod
```

Verify `GET /api/health` after deployment. Production is ready only when it returns `ok: true`, `demoMode: false`,
`databaseConfigured: true`, and `authenticationRequired: true`.

See [Production Checklist](docs/production-checklist.md) before onboarding customer data.
