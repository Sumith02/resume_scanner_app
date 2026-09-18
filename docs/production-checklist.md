# Production Checklist

## Required Before Customer Data

- Rotate every Supabase secret/service-role key that has been shared outside the password manager.
- Use an active Supabase project and run both migrations in order.
- Enable email confirmation and configure the production Site URL in Supabase Auth.
- Configure a custom SMTP provider for Supabase authentication emails.
- Verify the sender domain in Resend and set `MAIL_FROM` to that domain.
- Complete Google OAuth verification before allowing arbitrary customer Gmail accounts.
- Set `AUTH_REQUIRED=true`, `ALLOW_DEMO_MODE=false`, and `VITE_ENABLE_SUPABASE_AUTH=true`.
- Generate independent OAuth-state and token-encryption secrets and store them only in Vercel.
- Confirm `/api/health` is healthy after every production deployment.
- Configure Vercel and Supabase log retention appropriate for the company privacy policy.
- Enable Supabase point-in-time recovery on the production plan.
- Publish privacy, retention, acceptable-use, and candidate communication policies.
- Establish a support owner and incident response process.

## Implemented Controls

- Server-validated Supabase sessions
- Organization isolation on every business query
- Owner, admin, recruiter, and viewer authorization
- Private resume storage with size and MIME restrictions
- Short-lived signed uploads with bounded browser concurrency
- Encrypted Gmail access and refresh tokens
- Signed, expiring OAuth state
- Pre-expiry token refresh plus one retry after Gmail 401 responses
- Idempotent Gmail attachment imports
- File checksum duplicate detection
- Append-only audit events for mutations
- Campaign batching and provider idempotency keys
- Candidate unsubscribe handling and suppression
- Production configuration fail-closed behavior
- Security headers and non-cacheable API responses
- Unit and API workflow tests

## Recommended Before Enterprise Sales

- Add Sentry error monitoring and alert routing.
- Add a durable queue for batches larger than one Vercel request.
- Add malware scanning for every uploaded attachment.
- Add data retention automation and customer-controlled permanent deletion.
- Add SAML SSO and SCIM provisioning for enterprise customers.
- **Two-tier tenant model (alignment note):** master admin (`sumithsbhatt@gmail.com`)
  is the platform vendor — his **only** duty is creating/deleting/editing **company
  accounts** (selling access, e.g. "XYZ Company"). He does **not** manage company
  users. Each company account carries a **company admin**, whose duty is creating
  3–4 **recruiter** users under that company. Those three roles are the whole model:
  master (tenant CRUD only) → company admin (its own recruiters) → recruiters (their
  company's data). Master admin must *not* accumulate the agency/recruiter actions;
  company admin is the one who brokers his own team. (Design alignment only — not yet
  implemented; current code still routes some agency actions to master.)
- Commission an external penetration test.
- Complete vendor DPAs and a documented GDPR/DPDP data-flow review.
