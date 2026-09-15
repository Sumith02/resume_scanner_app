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
