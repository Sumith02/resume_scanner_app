-- NEXERRA TALENT OS by Vithsutra Technologies Pvt Ltd
-- Migration 004: Enterprise ATS, Agency Multi-Client OS, Interview Scorecards, Offers, and Compliance

-- 1. Interview Plans & Scorecards
create table if not exists public.interview_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  title text not null default 'Technical Interview',
  interview_type text not null default 'technical', -- 'screening', 'technical', 'system_design', 'cultural', 'executive'
  interviewer_id text not null default '',
  interviewer_name text not null default '',
  scheduled_at timestamptz,
  status text not null default 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'cancelled'
  meeting_link text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_scorecards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  interview_plan_id uuid not null references public.interview_plans(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  interviewer_id text not null,
  interviewer_name text not null default '',
  technical_rating integer not null default 3 check (technical_rating between 1 and 5),
  communication_rating integer not null default 3 check (communication_rating between 1 and 5),
  problem_solving_rating integer not null default 3 check (problem_solving_rating between 1 and 5),
  culture_fit_rating integer not null default 3 check (culture_fit_rating between 1 and 5),
  overall_recommendation text not null default 'neutral', -- 'strong_hire', 'hire', 'neutral', 'no_hire', 'strong_no_hire'
  strengths text not null default '',
  concerns text not null default '',
  detailed_feedback text not null default '',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 2. Pipeline Stages & Candidate Stage History
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  stage_key text not null,
  order_index integer not null default 0,
  sla_hours integer not null default 48,
  created_at timestamptz not null default now()
);

create table if not exists public.candidate_stage_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  from_stage text not null default '',
  to_stage text not null,
  changed_by text not null default 'system',
  reason text not null default '',
  duration_in_stage_hours numeric(6,2),
  created_at timestamptz not null default now()
);

-- 3. Job Offers & Onboarding
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  base_salary numeric(12,2) not null default 0,
  currency text not null default 'INR',
  bonus numeric(12,2) not null default 0,
  equity text not null default '',
  joining_date text not null default '',
  expiration_date text not null default '',
  status text not null default 'draft', -- 'draft', 'pending_approval', 'sent', 'accepted', 'declined', 'revoked'
  offer_letter_path text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  background_check_status text not null default 'pending', -- 'pending', 'passed', 'flagged'
  documents_verified boolean not null default false,
  equipment_provisioned boolean not null default false,
  start_date text not null default '',
  buddy_assigned text not null default '',
  status text not null default 'in_progress', -- 'in_progress', 'completed'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Recruiter Match Feedback & Human Calibration
create table if not exists public.recruiter_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  recruiter_id text not null,
  override_score integer check (override_score between 0 and 100),
  feedback_category text not null default 'general', -- 'skill_accuracy', 'experience_relevance', 'false_positive', 'false_negative'
  comments text not null default '',
  created_at timestamptz not null default now()
);

-- 5. Agency Multi-Client Operations & Invoicing
create table if not exists public.agency_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  industry text not null default '',
  tier text not null default 'Standard', -- 'Enterprise Retained', 'Exclusive Search', 'High-Volume Contingency', 'Standard'
  sla_hours integer not null default 24,
  primary_recruiter text not null default '',
  status text not null default 'Active',
  avg_placement_days integer not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.client_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.agency_clients(id) on delete cascade,
  title text not null,
  department text not null default '',
  status text not null default 'open',
  target_hires integer not null default 1,
  filled_hires integer not null default 0,
  fee_percentage numeric(5,2) not null default 15.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_shortlists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.agency_clients(id) on delete cascade,
  job_id uuid references public.client_jobs(id) on delete set null,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  shared_at timestamptz not null default now(),
  client_status text not null default 'pending_review', -- 'pending_review', 'accepted', 'rejected', 'interview_requested'
  client_feedback text not null default '',
  feedback_at timestamptz
);

create table if not exists public.placements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.agency_clients(id) on delete cascade,
  job_id uuid references public.client_jobs(id) on delete set null,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  placed_date text not null default '',
  base_salary numeric(12,2) not null default 0,
  placement_fee numeric(12,2) not null default 0,
  guarantee_days integer not null default 90,
  invoice_status text not null default 'unbilled', -- 'unbilled', 'invoiced', 'paid'
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.agency_clients(id) on delete cascade,
  invoice_number text not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'INR',
  due_date text not null default '',
  status text not null default 'unpaid', -- 'draft', 'sent', 'paid', 'overdue'
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- 6. Compliance, GDPR/DPDP Consent, Data Export & Deletion
create table if not exists public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by text not null,
  export_type text not null default 'candidates_full', -- 'candidates_full', 'audit_logs', 'compliance_dump'
  format text not null default 'json', -- 'json', 'csv'
  status text not null default 'pending', -- 'pending', 'processing', 'completed', 'failed'
  download_url text not null default '',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  candidate_id text not null,
  candidate_email text not null default '',
  requested_by text not null,
  reason text not null default 'Candidate right to be forgotten request',
  status text not null default 'completed',
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  policy_name text not null,
  data_type text not null default 'resumes', -- 'resumes', 'audit_logs', 'rejected_candidates'
  retention_days integer not null default 730, -- default 2 years
  action text not null default 'anonymize', -- 'delete', 'anonymize', 'archive'
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Performance Indexes
create index if not exists interview_plans_cand_idx on public.interview_plans (candidate_id, status);
create index if not exists interview_scorecards_plan_idx on public.interview_scorecards (interview_plan_id);
create index if not exists stage_history_cand_idx on public.candidate_stage_history (candidate_id, created_at desc);
create index if not exists offers_cand_idx on public.offers (candidate_id, status);
create index if not exists client_shortlists_client_idx on public.client_shortlists (client_id, client_status);
create index if not exists placements_client_idx on public.placements (client_id, placed_date desc);
create index if not exists invoices_client_idx on public.invoices (client_id, status);
create index if not exists deletion_reqs_org_idx on public.deletion_requests (organization_id, created_at desc);
