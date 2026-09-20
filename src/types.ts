export type Role =
  | "MASTER_ADMIN"
  | "COMPANY_OWNER"
  | "COMPANY_ADMIN"
  | "RECRUITER"
  | "HIRING_MANAGER"
  | "INTERVIEWER"
  | "READ_ONLY";

export type OrgStatus =
  | "CREATED"
  | "INVITATION_SENT"
  | "ACTIVATED"
  | "ACTIVE"
  | "SUSPENDED"
  | "DEACTIVATED";

export type UserStatus =
  | "INVITED"
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "REACTIVATED";

export type CandidateStage =
  | "NEW"
  | "PARSED"
  | "IN_REVIEW"
  | "SHORTLISTED"
  | "INTERVIEW"
  | "OFFER"
  | "ONBOARDING"
  | "PLACED"
  | "REJECTED";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  organization_id: number | null;
  scope: "platform" | "company";
  permissions: string[];
  invited: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string | null;
}

export interface Seats {
  limit: number;
  used: number;
  available: number;
}

export interface Company {
  id: number;
  name: string;
  slug: string;
  email: string | null;
  status: OrgStatus;
  seat_limit: number;
  feature_flags: Record<string, unknown>;
  seats: Seats | null;
  created_at: string | null;
  pending_seat_requests?: number;
}

export interface SeatRequest {
  id: number;
  organization_id: number;
  company_name?: string;
  current_seats: number;
  requested_seats: number;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string | null;
}

export interface Job {
  id: number;
  title: string;
  client_name: string | null;
  department: string | null;
  location: string | null;
  employment_type: string | null;
  status: "DRAFT" | "OPEN" | "CLOSED" | "ON_HOLD";
  salary_range: string | null;
  requirements: string | null;
  skills: string[];
  created_at: string | null;
  rediscovered_candidate_count?: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Candidate {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  experience_years: number;
  has_resume: boolean;
  resume_filename: string | null;
  source: string;
  stage: CandidateStage;
  duplicate_of_id: number | null;
  matched_job_ids: number[];
  createdAt?: string;
  created_at: string | null;
  tags: Tag[];
}

export interface Note {
  id: number;
  candidate_id: number;
  author_user_id: number | null;
  author_name: string | null;
  body: string;
  created_at: string | null;
}

export interface AuditEntry {
  id: number;
  organization_id: number | null;
  actor_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  details: Record<string, unknown>;
  created_at: string | null;
}

export interface Pipeline {
  stages: CandidateStage[];
  counts: Partial<Record<CandidateStage, number>>;
}

// ---------------------------------------------------------------------------
// Phase 3 — Intelligence
// ---------------------------------------------------------------------------

export interface TalentPool {
  id: number;
  name: string;
  description: string | null;
  is_shared: boolean;
  member_count: number;
  created_at: string | null;
  candidates?: Candidate[];
}

export interface MatchResult extends Candidate {
  match_score: number;
  match_band: "strong" | "possible" | "weak";
  matched_skills: string[];
  missing_skills: string[];
  match_reasons: string[];
}

export interface MatchResponse {
  job_id: number;
  job_title: string;
  count: number;
  results: MatchResult[];
}

export interface CandidateMatches {
  candidate_id: number;
  count: number;
  results: {
    job_id: number;
    job_title: string;
    match_score: number;
    match_band: string;
    matched_skills: string[];
    missing_skills: string[];
    match_reasons: string[];
  }[];
}

export interface CopilotResult {
  query: string;
  criteria: {
    skills: string[];
    stages: string[];
    min_experience: number | null;
    location: string | null;
    keywords: string[];
  };
  count: number;
  message: string;
  candidates: Candidate[];
}

export interface SavedSearch {
  id: number;
  name: string;
  criteria: Record<string, unknown>;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Phase 4 — Operations
// ---------------------------------------------------------------------------

export type InterviewStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type InterviewMode = "VIDEO" | "ONSITE" | "PHONE";

export interface Interview {
  id: number;
  candidate_id: number;
  job_id: number | null;
  title: string | null;
  scheduled_at: string | null;
  duration_minutes: number;
  mode: InterviewMode;
  location: string | null;
  status: InterviewStatus;
  interviewer_user_id: number | null;
  scorecard_count: number;
  average_rating: number | null;
  created_at: string | null;
  scorecards?: Scorecard[];
}

export interface Scorecard {
  id: number;
  interview_id: number;
  interviewer_user_id: number | null;
  technical: number | null;
  communication: number | null;
  culture_fit: number | null;
  overall: number | null;
  recommendation: string | null;
  notes: string | null;
  created_at: string | null;
}

export type OfferStatus = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";

export interface Offer {
  id: number;
  candidate_id: number;
  job_id: number | null;
  salary: number | null;
  currency: string;
  employment_type: string | null;
  start_date: string | null;
  status: OfferStatus;
  notes: string | null;
  created_at: string | null;
}

export type OnboardingStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export interface OnboardingTask {
  id: number;
  candidate_id: number;
  title: string;
  status: OnboardingStatus;
  due_date: string | null;
  completed_at: string | null;
}

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  created_at: string | null;
}

export interface EmailMessage {
  id: number;
  candidate_id: number | null;
  template_id: number | null;
  to_email: string;
  subject: string;
  body: string;
  status: string;
  provider: string;
  error: string | null;
  sent_at: string | null;
  created_at: string | null;
}

export interface EmailAccount {
  id: number;
  provider: string;
  email: string | null;
  status: string;
  is_demo: boolean;
  history_id: string | null;
  last_sync_at: string | null;
  last_sync_summary: Record<string, unknown>;
}

export interface GmailStatus {
  oauth_configured: boolean;
  demo_available: boolean;
  account: EmailAccount | null;
  smtp_configured: boolean;
}

// ---------------------------------------------------------------------------
// Phase 5 — SaaS
// ---------------------------------------------------------------------------

export interface Plan {
  code: string;
  name: string;
  price_monthly_cents: number;
  seat_limit: number;
  quotas: Record<string, number>;
  features: string[];
}

export interface UsageSummary {
  plan: Plan;
  period: string;
  metrics: Record<
    string,
    { used: number; limit: number; remaining: number; percent: number }
  >;
  features: Record<string, boolean>;
}

export interface Subscription {
  id: number;
  plan_code: string;
  status: string;
  seats: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface Invoice {
  id: number;
  number: string;
  amount_cents: number;
  currency: string;
  status: string;
  lines: { description: string; amount_cents: number }[];
  period: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
}

export interface PortalToken {
  id: number;
  client_name: string;
  job_ids: number[];
  can_view_candidates: boolean;
  is_active: boolean;
  expires_at: string | null;
  last_viewed_at: string | null;
  created_at: string | null;
  token?: string;
}

export interface PortalView {
  client_name: string;
  organization: string | null;
  can_view_candidates: boolean;
  jobs: {
    id: number;
    title: string;
    location: string | null;
    status: string;
    employment_type: string | null;
    candidates: { total: number; by_stage: Record<string, number> } | null;
  }[];
}

export interface AnalyticsOverview {
  totals: {
    candidates: number;
    jobs: number;
    open_jobs: number;
    interviews: number;
    offers: number;
    hires: number;
    duplicates: number;
  };
  funnel: { stage: string; count: number }[];
  conversion: Record<string, number>;
  sources: { source: string; count: number }[];
  top_skills: { skill: string; count: number }[];
  offers: { by_status: { status: string; count: number }[]; acceptance_rate: number };
  interview_load: { user_id: number; name: string; count: number }[];
  recruiter_performance: { user_id: number; name: string; candidates: number }[];
  job_performance: {
    job_id: number;
    title: string;
    status: string;
    candidates: number;
    offers: number;
    hires: number;
  }[];
}

export interface PlatformAnalytics {
  organizations: {
    total: number;
    by_status: { status: string; count: number }[];
    by_plan: { plan: string; count: number }[];
    mrr_cents: number;
  };
  totals: Record<string, number>;
  top_orgs: {
    id: number;
    name: string;
    status: string;
    plan: string;
    seat_limit: number;
    candidates: number;
    jobs: number;
  }[];
}