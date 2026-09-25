import type {
  AnalyticsOverview,
  AuditEntry,
  Candidate,
  CandidateMatches,
  Company,
  CopilotResult,
  EmailAccount,
  EmailMessage,
  EmailTemplate,
  GmailStatus,
  Interview,
  Invoice,
  Job,
  MatchResponse,
  Note,
  Offer,
  OnboardingTask,
  Pipeline,
  Plan,
  PlatformAnalytics,
  PortalToken,
  PortalView,
  SavedSearch,
  SeatRequest,
  Seats,
  Subscription,
  Tag,
  TalentPool,
  UsageSummary,
  User,
} from "./types";

const TOKEN_KEY = "nexerra.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isForm = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!isForm && options.body) headers.set("Content-Type", "application/json");

  const fullUrl = apiUrl(path);
  let res: Response;
  try {
    res = await fetch(fullUrl, { ...options, headers });
  } catch {
    throw new ApiError(
      0,
      `Cannot reach API server at ${fullUrl}. Please ensure the backend is running.`,
    );
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    if (payload && typeof payload === "object" && "detail" in payload) {
      const d = (payload as { detail: unknown }).detail;
      detail = typeof d === "string" ? d : JSON.stringify(d);
    } else if (res.status === 404) {
      detail = `API endpoint not found (404). Ensure the backend is deployed.`;
    }
    throw new ApiError(res.status, detail);
  }
  return payload as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  // auth
  bootstrap: (data: { email?: string; password?: string; name?: string }) =>
    request<{ message: string; user: User }>("/api/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  acceptInvite: (email: string, token: string, password: string) =>
    request<{ access_token: string; user: User }>("/api/auth/accept-invite", {
      method: "POST",
      body: JSON.stringify({ email, token, password }),
    }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ access_token: string; user: User }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
  me: () => request<User>("/api/auth/me"),

  // master
  listCompanies: () => request<Company[]>("/api/master/companies"),
  createCompany: (data: {
    name: string;
    email: string;
    seat_limit: number;
    plan?: string;
  }) =>
    request<{
      company: Company;
      admin: User;
      invite_token: string;
    }>("/api/master/companies", { method: "POST", body: JSON.stringify(data) }),
  setCompanyStatus: (orgId: number, status: string) =>
    request<{ company: Company }>(`/api/master/companies/${orgId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  setCompanyPlan: (orgId: number, plan_code: string) =>
    request<{ organization_id: number; plan_code: string }>(
      `/api/billing/organizations/${orgId}/plan`,
      { method: "POST", body: JSON.stringify({ plan_code }) },
    ),
  inviteCompanyAdmin: (orgId: number, data: { email: string; name: string; role: string }) =>
    request<{ user: User; invite_token: string }>(
      `/api/master/companies/${orgId}/admins`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  listSeatRequests: () => request<SeatRequest[]>("/api/master/seat-requests"),
  reviewSeatRequest: (id: number, approve: boolean, reason?: string) =>
    request<{ message: string }>(`/api/master/seat-requests/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ approve, reason }),
    }),
  masterAudit: () => request<AuditEntry[]>("/api/master/audit"),
  masterStats: () =>
    request<{
      organizations: number;
      total_seats: number;
      total_users: number;
      total_jobs: number;
      total_candidates: number;
      status_breakdown: Record<string, number>;
    }>("/api/master/stats"),

  // org
  seats: () => request<Seats>("/api/org/seats"),
  usage: () => request<Record<string, unknown>>("/api/org/usage"),
  requestSeats: (reason?: string) =>
    request<{ message: string; current: number; requested: number }>(
      "/api/org/seats/request",
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  listUsers: () => request<User[]>("/api/org/users"),
  createUser: (data: { email: string; name: string; role: string }) =>
    request<{ user: User; invite_token: string; seats: Seats }>("/api/org/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateUser: (id: number, data: { name?: string; role?: string; status?: string }) =>
    request<User>(`/api/org/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  orgAudit: () => request<AuditEntry[]>("/api/org/audit"),

  // jobs
  listJobs: (status?: string) => request<Job[]>(`/api/org/jobs${qs({ status })}`),
  createJob: (data: Partial<Job> & { title: string }) =>
    request<Job>("/api/org/jobs", { method: "POST", body: JSON.stringify(data) }),
  updateJob: (id: number, data: Partial<Job> & { title: string }) =>
    request<Job>(`/api/org/jobs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteJob: (id: number) =>
    request<{ message: string }>(`/api/org/jobs/${id}`, { method: "DELETE" }),

  // candidates
  listCandidates: (params: Record<string, string | number | undefined> = {}) =>
    request<Candidate[]>(`/api/org/candidates${qs(params)}`),
  getCandidate: (id: number) => request<Candidate>(`/api/org/candidates/${id}`),
  createCandidateForm: (form: FormData) =>
    request<Candidate>("/api/org/candidates", { method: "POST", body: form }, true),
  bulkUploadCandidates: (form: FormData) =>
    request<{
      total: number;
      succeeded: number;
      duplicates: number;
      failed: number;
      candidates: Candidate[];
      errors: { filename: string; error: string }[];
    }>("/api/org/candidates/bulk-upload", { method: "POST", body: form }, true),
  setStage: (id: number, stage: string) =>
    request<Candidate>(`/api/org/candidates/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage }),
    }),
  patchCandidateJobs: (id: number, add: number[], remove: number[]) =>
    request<Candidate>(`/api/org/candidates/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ add_job_ids: add, remove_job_ids: remove }),
    }),
  patchCandidate: (
    id: number,
    data: {
      location?: string;
      current_title?: string;
      current_company?: string;
      summary?: string;
    }
  ) =>
    request<Candidate>(`/api/org/candidates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteCandidate: (id: number) =>
    request<{ message: string }>(`/api/org/candidates/${id}`, { method: "DELETE" }),
  bulkDeleteCandidates: (candidateIds: number[]) =>
    request<{ deleted: number }>("/api/org/candidates/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ candidate_ids: candidateIds }),
    }),
  listNotes: (id: number) => request<Note[]>(`/api/org/candidates/${id}/notes`),
  addNote: (id: number, body: string) =>
    request<Note>(`/api/org/candidates/${id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  listTags: () => request<Tag[]>("/api/org/tags"),
  createTag: (name: string, color: string) =>
    request<Tag>("/api/org/tags", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  patchCandidateTags: (id: number, add: number[], remove: number[]) =>
    request<Candidate>(`/api/org/candidates/${id}/tags`, {
      method: "PATCH",
      body: JSON.stringify({ add_tag_ids: add, remove_tag_ids: remove }),
    }),
  pipeline: () => request<Pipeline>("/api/org/pipeline"),

  // ---- Phase 3: intelligence ----
  listPools: () => request<TalentPool[]>("/api/pools"),
  getPool: (id: number) => request<TalentPool>(`/api/pools/${id}`),
  createPool: (data: { name: string; description?: string; is_shared?: boolean }) =>
    request<TalentPool>("/api/pools", { method: "POST", body: JSON.stringify(data) }),
  deletePool: (id: number) =>
    request<null>(`/api/pools/${id}`, { method: "DELETE" }),
  addPoolMembers: (id: number, candidateIds: number[]) =>
    request<{ added: number; pool: TalentPool }>(`/api/pools/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ candidate_ids: candidateIds }),
    }),
  removePoolMember: (id: number, candidateId: number) =>
    request<null>(`/api/pools/${id}/members/${candidateId}`, { method: "DELETE" }),
  matchJob: (data: { job_id: number; threshold?: number; exclude_applied?: boolean }) =>
    request<MatchResponse>("/api/match", { method: "POST", body: JSON.stringify(data) }),
  candidateMatches: (id: number) =>
    request<CandidateMatches>(`/api/candidates/${id}/matches`),
  copilot: (query: string) =>
    request<CopilotResult>("/api/copilot", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
  listSavedSearches: () => request<SavedSearch[]>("/api/saved-searches"),
  createSavedSearch: (name: string, criteria: Record<string, unknown>) =>
    request<SavedSearch>("/api/saved-searches", {
      method: "POST",
      body: JSON.stringify({ name, criteria }),
    }),
  deleteSavedSearch: (id: number) =>
    request<null>(`/api/saved-searches/${id}`, { method: "DELETE" }),

  // ---- Phase 4: operations ----
  listInterviews: (params: Record<string, string | number | undefined> = {}) =>
    request<Interview[]>(`/api/interviews${qs(params)}`),
  getInterview: (id: number) => request<Interview>(`/api/interviews/${id}`),
  createInterview: (data: Partial<Interview> & { candidate_id: number }) =>
    request<Interview>("/api/interviews", { method: "POST", body: JSON.stringify(data) }),
  updateInterview: (id: number, data: Partial<Interview>) =>
    request<Interview>(`/api/interviews/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteInterview: (id: number) =>
    request<null>(`/api/interviews/${id}`, { method: "DELETE" }),
  submitScorecard: (id: number, data: Record<string, unknown>) =>
    request<import("./types").Scorecard>(`/api/interviews/${id}/scorecards`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  bulkCreateInterviews: async (data: {
    candidate_ids: number[];
    job_id?: number | null;
    title?: string;
    scheduled_at?: string | null;
    duration_minutes?: number;
    mode?: string;
    location?: string | null;
    interviewer_user_id?: number | null;
    advance_stage?: boolean;
  }) => {
    try {
      return await request<{ created_count: number; interviews: Interview[] }>(
        "/api/interviews/bulk",
        { method: "POST", body: JSON.stringify(data) },
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        const results = await Promise.all(
          data.candidate_ids.map(async (cid) => {
            const iv = await api.createInterview({
              candidate_id: cid,
              job_id: data.job_id,
              title: data.title,
              scheduled_at: data.scheduled_at,
              duration_minutes: data.duration_minutes,
              mode: data.mode as any,
              location: data.location,
              interviewer_user_id: data.interviewer_user_id,
            });
            if (data.advance_stage) {
              try {
                await api.setStage(cid, "INTERVIEW");
              } catch {}
            }
            return iv;
          }),
        );
        return { created_count: results.length, interviews: results };
      }
      throw e;
    }
  },

  listOffers: (params: Record<string, string | number | undefined> = {}) =>
    request<Offer[]>(`/api/offers${qs(params)}`),
  createOffer: (data: Partial<Offer> & { candidate_id: number }) =>
    request<Offer>("/api/offers", { method: "POST", body: JSON.stringify(data) }),
  bulkCreateOffers: async (data: {
    candidate_ids: number[];
    job_id?: number | null;
    salary?: number | null;
    currency?: string;
    employment_type?: string | null;
    start_date?: string | null;
    notes?: string | null;
    status?: string;
    advance_stage?: boolean;
  }) => {
    try {
      return await request<{ created_count: number; offers: Offer[] }>(
        "/api/offers/bulk",
        { method: "POST", body: JSON.stringify(data) },
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        const results = await Promise.all(
          data.candidate_ids.map(async (cid) => {
            const ofr = await api.createOffer({
              candidate_id: cid,
              job_id: data.job_id,
              salary: data.salary,
              currency: data.currency ?? "USD",
              employment_type: data.employment_type,
              start_date: data.start_date,
              notes: data.notes,
              status: (data.status as any) ?? "DRAFT",
            });
            if (data.advance_stage) {
              try {
                await api.setStage(cid, "OFFER");
              } catch {}
            }
            return ofr;
          }),
        );
        return { created_count: results.length, offers: results };
      }
      throw e;
    }
  },
  updateOffer: (id: number, data: Partial<Offer>) =>
    request<Offer>(`/api/offers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  setOfferStatus: (id: number, status: string) =>
    request<Offer>(`/api/offers/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  deleteOffer: (id: number) => request<null>(`/api/offers/${id}`, { method: "DELETE" }),

  listOnboarding: (candidateId?: number) =>
    request<OnboardingTask[]>(`/api/onboarding${qs({ candidate_id: candidateId })}`),
  createOnboardingTask: (data: { candidate_id: number; title: string; due_date?: string }) =>
    request<OnboardingTask>("/api/onboarding", { method: "POST", body: JSON.stringify(data) }),
  bulkCreateOnboarding: async (data: {
    candidate_ids: number[];
    tasks?: { title: string; due_date?: string | null }[];
    title?: string;
    due_date?: string | null;
    advance_stage?: boolean;
  }) => {
    try {
      return await request<{ created_count: number; tasks: OnboardingTask[] }>(
        "/api/onboarding/bulk",
        { method: "POST", body: JSON.stringify(data) },
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        const taskDefs =
          data.tasks && data.tasks.length > 0
            ? data.tasks
            : [{ title: data.title || "Complete Onboarding", due_date: data.due_date }];
        const results: OnboardingTask[] = [];
        for (const cid of data.candidate_ids) {
          for (const tdef of taskDefs) {
            const task = await api.createOnboardingTask({
              candidate_id: cid,
              title: tdef.title,
              due_date: tdef.due_date || undefined,
            });
            results.push(task);
          }
          if (data.advance_stage) {
            try {
              await api.setStage(cid, "ONBOARDING");
            } catch {}
          }
        }
        return { created_count: results.length, tasks: results };
      }
      throw e;
    }
  },
  updateOnboardingTask: (id: number, data: Partial<OnboardingTask>) =>
    request<OnboardingTask>(`/api/onboarding/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteOnboardingTask: (id: number) =>
    request<null>(`/api/onboarding/${id}`, { method: "DELETE" }),

  listEmailTemplates: () => request<EmailTemplate[]>("/api/email/templates"),
  createEmailTemplate: (data: { name: string; subject: string; body: string }) =>
    request<EmailTemplate>("/api/email/templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteEmailTemplate: (id: number) =>
    request<null>(`/api/email/templates/${id}`, { method: "DELETE" }),
  listEmailMessages: (candidateId?: number) =>
    request<EmailMessage[]>(`/api/email/messages${qs({ candidate_id: candidateId })}`),
  sendEmail: (data: {
    to_email?: string;
    candidate_id?: number;
    subject: string;
    body: string;
    template_id?: number;
  }) => request<EmailMessage>("/api/email/send", { method: "POST", body: JSON.stringify(data) }),
  getVacancyCandidates: (jobId: number, audience: "matching" | "all" = "matching") =>
    request<{
      job: Job;
      total_candidates: number;
      eligible_count: number;
      audience: string;
      candidates: Array<{
        id: number;
        name: string;
        email: string;
        current_title?: string;
        skills: string[];
        location?: string;
        stage: string;
        match_reason: string;
      }>;
    }>(`/api/email/vacancy-candidates${qs({ job_id: jobId, audience })}`),
  broadcastVacancy: (data: {
    job_id: number;
    audience: "matching" | "all";
    subject: string;
    body: string;
    candidate_ids?: number[];
  }) =>
    request<{
      status: string;
      sent_count: number;
      job_title: string;
      audience: string;
    }>("/api/email/broadcast-vacancy", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  gmailStatus: () => request<GmailStatus>("/api/email/gmail/status"),
  gmailConnect: () =>
    request<{ oauth_configured: boolean; auth_url: string | null; message?: string }>(
      "/api/email/gmail/connect",
    ),
  gmailConnectDemo: () =>
    request<{ account: EmailAccount; inbox_dir: string }>(
      "/api/email/gmail/connect-demo",
      { method: "POST" },
    ),
  gmailSync: (opts?: { full_scan?: boolean }) =>
    request<{ summary: Record<string, unknown>; account: EmailAccount }>(
      opts?.full_scan ? "/api/email/gmail/sync?full_scan=true" : "/api/email/gmail/sync",
      { method: "POST" },
    ),
  gmailDisconnect: () => request<null>("/api/email/gmail", { method: "DELETE" }),

  // ---- Phase 5: SaaS ----
  listPlans: () => request<Plan[]>("/api/billing/plans"),
  usageSummary: () => request<UsageSummary>("/api/billing/usage"),
  subscription: () =>
    request<{ plan: Plan; subscription: Subscription | null; seats: { limit: number } }>(
      "/api/billing/subscription",
    ),
  subscribe: (plan_code: string) =>
    request<{ plan: Plan; subscription: Subscription | null }>("/api/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan_code }),
    }),
  listInvoices: () => request<Invoice[]>("/api/billing/invoices"),
  payInvoice: (id: number) =>
    request<Invoice>(`/api/billing/invoices/${id}/pay`, { method: "POST" }),
  assignPlan: (orgId: number, plan_code: string, extra: Record<string, unknown> = {}) =>
    request<{ organization_id: number; plan_code: string; seat_limit: number }>(
      `/api/billing/organizations/${orgId}/plan`,
      { method: "POST", body: JSON.stringify({ plan_code, ...extra }) },
    ),

  listPortalTokens: () => request<PortalToken[]>("/api/portal/tokens"),
  createPortalToken: (data: {
    client_name: string;
    job_ids?: number[];
    can_view_candidates?: boolean;
    expires_in_days?: number;
  }) => request<PortalToken>("/api/portal/tokens", { method: "POST", body: JSON.stringify(data) }),
  updatePortalToken: (id: number, data: Partial<PortalToken> & { expires_in_days?: number }) =>
    request<PortalToken>(`/api/portal/tokens/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deletePortalToken: (id: number) =>
    request<null>(`/api/portal/tokens/${id}`, { method: "DELETE" }),

  analyticsOverview: () => request<AnalyticsOverview>("/api/analytics/overview"),
  platformAnalytics: () => request<PlatformAnalytics>("/api/analytics/platform"),

  // ---- Public client portal (no auth) ----
  publicPortal: (token: string) => request<PortalView>(`/api/portal/${token}`),
  publicPortalCandidates: (token: string, jobId: number) =>
    request<{
      job: { id: number; title: string };
      count: number;
      candidates: {
        name: string;
        current_title: string | null;
        current_company: string | null;
        location: string | null;
        skills: string[];
        experience_years: number;
        stage: string;
      }[];
    }>(`/api/portal/${token}/jobs/${jobId}/candidates`),
};