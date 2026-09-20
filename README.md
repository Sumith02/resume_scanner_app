# Nexerra Talent OS

A multi-tenant recruitment operating system. A platform **Master Admin** provisions
recruitment companies; each company is an isolated tenant that manages its own users and
recruitment operations within allocated seats and quotas. The system turns resumes into
searchable, reusable talent intelligence rather than acting as a resume filing cabinet.

This is a from-scratch implementation of the full build order from
`Nexerra_Talent_OS_Product_Flow.pdf`:

- **Phase 1 — Foundation**: hierarchy, tenant isolation, seats, permission-based RBAC, audit.
- **Phase 2 — Recruitment Core**: jobs, resume parsing, skill extraction, duplicate detection, pipeline.
- **Phase 3 — Intelligence**: talent pools, AI matching, rediscovery, saved searches, Copilot.
- **Phase 4 — Operations**: interviews + scorecards, offers, onboarding, outbound email, **Gmail resume ingestion**.
- **Phase 5 — SaaS**: plans, subscriptions, usage metering + quota enforcement, invoices, client portal, analytics.

## Architecture

```
PLATFORM
  └── MASTER_ADMIN            platform provisioning, plans, quotas, feature flags, audit
       └── ORGANIZATION       isolated tenant (company)
            ├── COMPANY_OWNER / COMPANY_ADMIN
            └── SUB-USERS     RECRUITER, HIRING_MANAGER, INTERVIEWER, READ_ONLY
```

- **Backend** — FastAPI + SQLAlchemy, JWT auth, SQLite by default (swap to Postgres via `DATABASE_URL`).
- **Frontend** — React 19 + Vite + TypeScript, React Router.
- **Tenant isolation** — enforced server-side: every company-owned query is scoped by the
  authenticated user's `organization_id`. No request body can select another tenant's rows.
- **RBAC** — authorization checks *permissions* (`resource:action`), with roles as bundles of
  permissions (`backend/rbac.py`). Role names are never used as authorization checks.
- **Quotas/seats** — enforced by the backend, not just hidden in the UI.
- **Lifecycle** — suspension preserves data; deactivation is a controlled state (no destructive delete);
  user deactivation preserves recruitment history.

```
backend/
  main.py            FastAPI app + router mounting
  config.py          env-driven settings
  db.py              SQLAlchemy engine/session
  models.py          organizations, users, seats, jobs, candidates, pools, interviews, offers, email, billing, portal
  repository.py      TENANT-SAFE data access (the isolation boundary)
  rbac.py            permission vocabulary + role bundles
  deps.py            auth/permission dependencies
  security.py        password hashing (PBKDF2) + JWT + OAuth state
  crypto.py          Fernet encryption for stored OAuth tokens
  resume_service.py  PDF/DOCX/TXT text extraction, skill/experience parsing
  ingestion.py       ONE resume ingestion pipeline (upload, Gmail, import)
  matching_engine.py explainable candidate↔job scoring
  copilot.py         rule-based natural-language recruiting assistant
  gmail_service.py   Gmail OAuth + incremental sync + local demo provider
  email_service.py   outbound email (Gmail / SMTP / mock)
  plans.py           plan catalog + quota/feature enforcement
  serializers.py     API shaping (incl. permissions)
  routers/           auth · master · org · jobs · candidates · pools · interviews ·
                     offers · onboarding · email · billing · analytics · portal
src/
  api.ts             typed API client
  lib/auth.tsx       auth context
  lib/perms.ts       permission checks for UI gating
  pages/…            master + company screens + public client portal
tests/               auth, master, tenant isolation, seats, RBAC, recruitment,
                     intelligence, operations, SaaS
scripts/seed.py      demo data
```

## Resume ingestion from email

Gmail is a **source adapter**: it produces `(filename, bytes)` and hands off to the
same `ingestion.ingest_resume()` pipeline used by manual uploads, so parsing, dedupe,
storage, audit and quota metering are identical.

1. A company admin connects Gmail via OAuth (`GET /api/email/gmail/connect`); tokens are
   encrypted at rest (`crypto.py`) and stored per tenant.
2. Sync walks messages with attachments, filters resume-like files, skips certificates/
   logos/cover letters, downloads attachments, and ingests them.
3. Repeat syncs are idempotent (processed message IDs are tracked), and a recorded
   `historyId` supports incremental Gmail history sync.
4. Without Google credentials the connector runs in **demo mode**
   (`POST /api/email/gmail/connect-demo`): drop resume files into `DEMO_INBOX_DIR` and
   sync — the full flow is runnable and tested offline.

Only a mailbox that matches an **email registered for the tenant by the platform admin** can
be connected or synced. A connector can never be pointed at an arbitrary personal mailbox:
the OAuth callback rejects a Google account whose address differs from the registered user,
and sync refuses any account whose address is not a registered recruiter/owner.

Google OAuth requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a redirect URI of
`<api>/api/email/gmail/callback`.

## Onboarding & account lifecycle

1. A **Master Admin provisions a user** (a company admin at company creation, or any user from
   the platform/company console). The backend generates a **temporary password** and emails the
   credentials plus an activation link.
2. On **first login** with the temporary password the user is redirected to
   **Set password** (`POST /api/auth/change-password`); the response carries
   `must_change_password: true` until a new password is saved.
3. After setting a password the user **connects their email (Gmail)** from the dashboard banner
   or the Email screen. Only then do resumes flow into the tenant's talent database.

Outbound invitations use `SMTP_*`; with no SMTP host configured they are recorded as mock sends.

## Plans & quotas

| Plan       | Seats | AI matches/mo | Resume parses/mo | Features |
| ---------- | ----- | ------------- | ---------------- | -------- |
| starter    | 3     | 100           | 100              | pools, matching, analytics |
| growth     | 15    | 5,000         | 2,000            | + Copilot, Gmail, client portal |
| enterprise | 100   | 100,000       | 25,000           | + API access |

Quotas are enforced server-side (`plans.consume_quota`) and metered per calendar month;
feature access is gated with `require_feature` (HTTP 402 when not included).

## Quick start

```bash
# 1. Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                        # then edit secrets/database
python scripts/seed.py                      # optional demo data
uvicorn backend.main:app --reload --port 4174

# 2. Frontend (separate terminal)
npm install
npm run dev                                 # http://localhost:5173 (proxies /api → :4174)
```

Open the app and either sign in with a seeded account or click **Set up the platform** to
create the first Master Admin.

### Demo accounts (from `scripts/seed.py`)

| Scope      | Email                        | Password          |
| ---------- | ---------------------------- | ----------------- |
| Master     | admin@nexerra.io             | Admin@12345       |
| Company    | owner@northwind.dev          | Owner@12345       |
| Recruiter  | recruiter@northwind.dev      | Recruiter@12345   |
| Read-only  | readonly@northwind.dev       | Readonly@12345    |
| Tenant #2  | owner@brightsearch.dev       | Owner@12345       |

## Core flow

1. **Master Admin** signs in → creates a company, sets seat limit, sends the company admin invitation.
2. **Company Admin** accepts the invite → adds users (only within allocated seats) → configures the tenant.
3. **Recruiters** upload resumes (or add candidates manually); resumes are parsed into structured
   profiles with normalized skills, experience, and duplicate detection against the tenant's database.
4. Candidates move through the pipeline: New → In Review → Shortlisted → Interview → Offer →
   Onboarding → Placed. Creating a job rediscovers matching historical candidates already on file.
5. **Seat requests** route to the Master Admin for approve/reject. All administrative and
   recruitment actions are recorded in the audit log.
6. **Phase 3+** — recruiters build talent pools, run explainable AI matching/rediscovery, and ask
   the Copilot; schedule interviews and submit scorecards; issue offers (accepting one moves the
   candidate to Placed and generates an onboarding checklist); send templated email; connect Gmail
   to ingest resumes automatically.
7. **Master Admin** assigns plans, reviews usage; companies share read-only client portals and
   track funnel/recruiter/job analytics.

## Environment

| Variable              | Default                          | Purpose                            |
| --------------------- | -------------------------------- | ---------------------------------- |
| `DATABASE_URL`        | `sqlite:///./nexerra.db`         | DB connection (use `postgresql+psycopg://…` in production) |
| `JWT_SECRET`          | dev secret                       | **Set in production** (≥32 random bytes) |
| `JWT_EXPIRES_MINUTES` | `1440`                           | Token lifetime                     |
| `INVITE_EXPIRES_HOURS`| `72`                             | Invite link lifetime               |
| `UPLOAD_DIR`          | `./uploads`                      | Resume storage                     |
| `MAX_RESUME_BYTES`    | `10485760` (10MB)                | Upload cap                         |
| `TOKEN_ENCRYPTION_KEY`| falls back to `JWT_SECRET`       | OAuth token encryption             |
| `BOOTSTRAP_EMAIL` / `BOOTSTRAP_NAME` / `BOOTSTRAP_PASSWORD` | seeded master | First platform admin |
| `PUBLIC_API_URL`      | —                                | Public API origin                  |
| `GOOGLE_CLIENT_ID`    | —                                | Gmail OAuth (demo mode if unset)   |
| `GOOGLE_CLIENT_SECRET`| —                                | Gmail OAuth                        |
| `GOOGLE_REDIRECT_URI` | `http://localhost:4174/api/email/gmail/callback` | OAuth callback       |
| `DEMO_INBOX_DIR`      | `./uploads/inbox`                | Demo Gmail inbox                   |
| `SMTP_HOST`           | —                                | Outbound email (mock if unset)     |
| `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` / `SMTP_USE_TLS` | — | SMTP config |
| `FRONTEND_URL`        | `http://localhost:5174`          | Invite + OAuth redirect target     |

A `.env` file is loaded automatically when present (via `python-dotenv`); see `.env.example`.

### Production notes

- Use PostgreSQL (`DATABASE_URL=postgresql+psycopg://…`); SQLite is for local dev only.
- Tables are created with `Base.metadata.create_all` — there are **no migrations** yet, so
  schema changes on an existing production database require a migration step (Alembic).
- Serve the SPA and API from the same origin (the frontend calls relative `/api/…`), or set
  up a reverse proxy.
- Set `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` to strong independent random values.

## Tests

```bash
python -m pytest          # backend: 35 tests across foundation → SaaS
npm run lint              # frontend typecheck
npm run build             # frontend production build
```
