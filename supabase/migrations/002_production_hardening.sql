-- Production hardening for the Python API. Run after 001_initial_schema.sql.

alter table public.applications
  add column if not exists file_path text not null default '',
  add column if not exists file_checksum text not null default '',
  add column if not exists source_external_id text,
  add column if not exists processing_status text not null default 'ready',
  add column if not exists processing_error text not null default '',
  add column if not exists email_opt_out boolean not null default false;

alter table public.gmail_connections
  add column if not exists token_version integer not null default 1;

alter table public.email_campaign_recipients
  add column if not exists provider_message_id text not null default '',
  add column if not exists attempts integer not null default 0;

create unique index if not exists applications_org_source_external_uidx
  on public.applications (organization_id, source_external_id)
  where source_external_id is not null;

create index if not exists applications_org_checksum_idx
  on public.applications (organization_id, file_checksum)
  where file_checksum <> '';

create index if not exists applications_org_email_opt_out_idx
  on public.applications (organization_id, lower(email), email_opt_out);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  14680064,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Application data is served only through the API, which performs organization
-- authorization before using the server-side secret key. Browser keys can only
-- use Supabase Auth and cannot query HR records directly.
revoke all on table public.organizations from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.organization_members from anon, authenticated;
revoke all on table public.gmail_connections from anon, authenticated;
revoke all on table public.jobs from anon, authenticated;
revoke all on table public.applications from anon, authenticated;
revoke all on table public.email_campaigns from anon, authenticated;
revoke all on table public.email_campaign_recipients from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

revoke execute on function public.is_org_member(uuid) from public, anon, authenticated;

comment on column public.gmail_connections.access_token is
  'Fernet-encrypted OAuth access token. Never store plaintext.';
comment on column public.gmail_connections.refresh_token is
  'Fernet-encrypted OAuth refresh token. Never store plaintext.';
comment on table public.audit_logs is
  'Append-only security and operational audit trail written by the API.';
