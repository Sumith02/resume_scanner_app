create extension if not exists pgcrypto;

do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'recruiter', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.application_status as enum (
    'new',
    'needs_review',
    'shortlisted',
    'screening',
    'interview',
    'offer',
    'hired',
    'hold',
    'rejected'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.job_status as enum ('draft', 'open', 'closed', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.campaign_status as enum ('draft', 'sending', 'sent', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  default_organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'recruiter',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  access_token text not null,
  refresh_token text not null,
  scope text not null,
  token_type text not null default 'Bearer',
  expiry_date timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, email)
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  department text not null default '',
  location text not null default '',
  description text not null default '',
  status public.job_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  candidate_name text not null default 'Unknown Candidate',
  email text not null default '',
  phone text not null default '',
  location text not null default 'Unknown',
  city text not null default '',
  region text not null default '',
  country text not null default '',
  location_confidence numeric not null default 0,
  primary_skill text not null default 'General Review',
  primary_skill_key text not null default 'general',
  skill_scores jsonb not null default '{}'::jsonb,
  skill_score_percent integer not null default 0,
  matched_skills text[] not null default '{}',
  experience_years numeric,
  summary text not null default '',
  text_preview text not null default '',
  resume_text_length integer not null default 0,
  original_name text not null,
  stored_name text not null,
  mime_type text not null default '',
  file_size integer not null default 0,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'Direct upload',
  role text not null default 'Open application',
  status public.application_status not null default 'new',
  notes text not null default '',
  tags text[] not null default '{}',
  duplicate_of uuid references public.applications(id) on delete set null
);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  title text not null,
  subject text not null,
  body text not null,
  status public.campaign_status not null default 'draft',
  recipient_filter jsonb not null default '{}'::jsonb,
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  candidate_email text not null,
  candidate_name text not null default '',
  status text not null default 'pending',
  error_message text not null default '',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists gmail_connections_org_user_idx on public.gmail_connections(organization_id, user_id);
create index if not exists jobs_org_status_idx on public.jobs(organization_id, status);
create index if not exists applications_org_uploaded_idx on public.applications(organization_id, uploaded_at desc);
create index if not exists applications_org_status_idx on public.applications(organization_id, status);
create index if not exists applications_org_email_idx on public.applications(organization_id, lower(email));
create index if not exists campaign_recipients_campaign_idx on public.email_campaign_recipients(campaign_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_organizations_updated_at on public.organizations;
create trigger touch_organizations_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_gmail_connections_updated_at on public.gmail_connections;
create trigger touch_gmail_connections_updated_at
before update on public.gmail_connections
for each row execute function public.touch_updated_at();

drop trigger if exists touch_jobs_updated_at on public.jobs;
create trigger touch_jobs_updated_at
before update on public.jobs
for each row execute function public.touch_updated_at();

drop trigger if exists touch_applications_updated_at on public.applications;
create trigger touch_applications_updated_at
before update on public.applications
for each row execute function public.touch_updated_at();

drop trigger if exists touch_email_campaigns_updated_at on public.email_campaigns;
create trigger touch_email_campaigns_updated_at
before update on public.email_campaigns
for each row execute function public.touch_updated_at();

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_org_id uuid;
  next_name text;
begin
  next_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Recruiter');

  insert into public.organizations (name, created_by)
  values (next_name || '''s Workspace', new.id)
  returning id into next_org_id;

  insert into public.profiles (id, email, full_name, default_organization_id)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', next_org_id);

  insert into public.organization_members (organization_id, user_id, role)
  values (next_org_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "members can read organizations" on public.organizations;
create policy "members can read organizations"
on public.organizations for select
using (public.is_org_member(id));

drop policy if exists "members can update organizations" on public.organizations;
create policy "members can update organizations"
on public.organizations for update
using (public.is_org_member(id))
with check (public.is_org_member(id));

drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile"
on public.profiles for select
using (id = auth.uid());

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "members can read memberships" on public.organization_members;
create policy "members can read memberships"
on public.organization_members for select
using (public.is_org_member(organization_id));

drop policy if exists "members can manage gmail connections" on public.gmail_connections;
create policy "members can manage gmail connections"
on public.gmail_connections for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members can manage jobs" on public.jobs;
create policy "members can manage jobs"
on public.jobs for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members can manage applications" on public.applications;
create policy "members can manage applications"
on public.applications for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members can manage campaigns" on public.email_campaigns;
create policy "members can manage campaigns"
on public.email_campaigns for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members can manage campaign recipients" on public.email_campaign_recipients;
create policy "members can manage campaign recipients"
on public.email_campaign_recipients for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members can read audit logs" on public.audit_logs;
create policy "members can read audit logs"
on public.audit_logs for select
using (organization_id is null or public.is_org_member(organization_id));
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
-- RESUME SCANNER — V11 Schema Migration
-- Builds the private talent intelligence layer, candidate/application separation,
-- multi-dimensional matching, talent rediscovery, talent pools, and copilot storage.

-- 1. Candidates (Canonical person entity, separated from individual job applications)
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  canonical_name text not null,
  blind_id text not null,
  email text not null default '',
  phone text not null default '',
  location text not null default 'Unknown',
  city text not null default '',
  region text not null default '',
  country text not null default '',
  current_title text not null default '',
  current_company text not null default '',
  profile_summary text not null default '',
  experience_years numeric(4,1),
  primary_domain text not null default 'General Review',
  primary_domain_key text not null default 'general',
  data_quality_score integer not null default 85,
  consent_status text not null default 'granted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

-- 2. Candidate Profiles (Enriched AI intelligence & career signals)
create table if not exists public.candidate_profiles (
  candidate_id uuid primary key references public.candidates(id) on delete cascade,
  headline text not null default '',
  summary text not null default '',
  seniority text not null default 'Mid-Level',
  industry text not null default 'Technology',
  career_level text not null default 'Professional',
  normalized_location text not null default '',
  availability text not null default 'Immediate',
  work_authorization text not null default 'Authorized',
  profile_confidence numeric(3,2) not null default 0.90,
  updated_at timestamptz not null default now()
);

-- 3. Normalized Global Skills Taxonomy
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  category text not null default 'General',
  aliases text[] not null default '{}',
  parent_skill_id uuid references public.skills(id) on delete set null,
  description text not null default '',
  created_at timestamptz not null default now()
);

-- 4. Candidate Skills (Extracted skills with proficiency and text evidence)
create table if not exists public.candidate_skills (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  skill_name text not null,
  normalized_skill text not null,
  proficiency text not null default 'Competent',
  years_experience numeric(4,1),
  evidence_text text not null default '',
  confidence numeric(3,2) not null default 0.85,
  source text not null default 'resume_parsing',
  created_at timestamptz not null default now()
);

-- 5. Candidate Experiences (Structured career timeline)
create table if not exists public.candidate_experiences (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  company text not null,
  title text not null,
  start_date text not null default '',
  end_date text not null default 'Present',
  description text not null default '',
  skills_used text[] not null default '{}',
  confidence numeric(3,2) not null default 0.90,
  created_at timestamptz not null default now()
);

-- 6. Candidate Educations (Academic history)
create table if not exists public.candidate_educations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  institution text not null,
  degree text not null default '',
  field text not null default '',
  start_date text not null default '',
  end_date text not null default '',
  confidence numeric(3,2) not null default 0.95,
  created_at timestamptz not null default now()
);

-- 7. Link Applications to Canonical Candidates
alter table public.applications
  add column if not exists candidate_id uuid references public.candidates(id) on delete cascade,
  add column if not exists stage text not null default 'new',
  add column if not exists match_score integer not null default 0;

-- 8. Candidate Job Matches (Multi-dimensional explainable scoring)
create table if not exists public.candidate_job_matches (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  overall_score integer not null default 0,
  required_skill_score integer not null default 0,
  preferred_skill_score integer not null default 0,
  experience_score integer not null default 0,
  education_score integer not null default 0,
  semantic_score integer not null default 0,
  location_score integer not null default 0,
  matched_skills text[] not null default '{}',
  missing_skills text[] not null default '{}',
  evidence jsonb not null default '{}'::jsonb,
  confidence numeric(3,2) not null default 0.90,
  algorithm_version text not null default 'v11.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, job_id)
);

-- 9. Candidate Events (Longitudinal activity timeline & audit)
create table if not exists public.candidate_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  event_type text not null,
  actor_id text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 10. Talent Pools (Persistent candidate grouping)
create table if not exists public.talent_pools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent_pool_members (
  pool_id uuid not null references public.talent_pools(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (pool_id, candidate_id)
);

-- 11. Saved Searches
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  query text not null default '',
  filters jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 12. Recruiter Copilot Conversations & Messages
create table if not exists public.copilot_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id text not null,
  title text not null default 'New Thread',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.copilot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.copilot_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  tool_calls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 13. Processing Jobs (Queue & ingestion diagnostics monitor)
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null,
  entity_id text not null default '',
  status text not null default 'completed',
  priority integer not null default 1,
  attempts integer not null default 1,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text not null default '',
  metadata jsonb not null default '{}'::jsonb
);

-- Indexes for lightning fast talent rediscovery and search
create index if not exists candidates_org_email_idx on public.candidates (organization_id, lower(email));
create index if not exists candidates_org_phone_idx on public.candidates (organization_id, phone);
create index if not exists candidates_org_primary_domain_idx on public.candidates (organization_id, primary_domain_key);
create index if not exists candidate_skills_candidate_idx on public.candidate_skills (candidate_id, normalized_skill);
create index if not exists candidate_events_candidate_idx on public.candidate_events (candidate_id, created_at desc);
create index if not exists candidate_job_matches_job_score_idx on public.candidate_job_matches (job_id, overall_score desc);
create index if not exists processing_jobs_org_status_idx on public.processing_jobs (organization_id, status);

-- Migration 005: Gmail Sync Watermark and Checkpoint Tracking
alter table public.gmail_connections
add column if not exists last_synced_at timestamptz,
add column if not exists last_message_date bigint,
add column if not exists sync_count integer default 0;

comment on column public.gmail_connections.last_synced_at is 'Timestamp of the last successful resume ingestion sync from Gmail';
comment on column public.gmail_connections.last_message_date is 'Epoch millisecond timestamp of the latest email message processed';
comment on column public.gmail_connections.sync_count is 'Total number of synchronization passes executed';

