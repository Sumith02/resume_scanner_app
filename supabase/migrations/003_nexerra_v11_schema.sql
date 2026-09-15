-- NEXERRA TALENT OS — V11 Schema Migration
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
