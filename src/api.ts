import type {
  AgencyClient,
  AgencyInvoice,
  AgencyOverview,
  ApplicationStatus,
  Candidate,
  CandidateApplication,
  CandidateEvent,
  CandidateJobMatch,
  CandidateStageHistory,
  ClientJob,
  ClientShortlist,
  EligibleCandidate,
  EmailCampaign,
  GmailImportResult,
  GmailStatus,
  InterviewPlan,
  InterviewScorecard,
  JobOffer,
  JobOpening,
  NaturalSearchResult,
  OnboardingRecord,
  PlacementRecord,
  ProcessingJob,
  ProvisionUserPayload,
  ProvisionUserResult,
  RecruiterFeedback,
  RediscoveryResponse,
  ReportSummary,
  RetentionPolicy,
  TalentGraphData,
  TalentPool,
  TaxonomyResponse,
  TeamMember,
  UploadResult
} from "./types";
import { isSupabaseBrowserConfigured, supabase } from "./supabaseClient";

const jsonHeaders = {
  "Content-Type": "application/json"
};

let accessToken = "";

export function setApiAccessToken(token: string): void {
  accessToken = token;
}

export interface CurrentUserProfile {
  user: {
    id: string;
    email: string;
    fullName?: string;
    role: "owner" | "admin" | "recruiter" | "hiring_manager" | "viewer";
    mustChangePassword?: boolean;
  };
  workspace: {
    id: string;
    name?: string;
    role: "owner" | "admin" | "recruiter" | "hiring_manager" | "viewer";
  };
}

export async function fetchCurrentUser(): Promise<CurrentUserProfile> {
  return request<CurrentUserProfile>("/api/me");
}

export async function fetchTaxonomy(): Promise<TaxonomyResponse> {
  return request<TaxonomyResponse>("/api/taxonomy");
}

export async function fetchApplications(): Promise<CandidateApplication[]> {
  const data = await request<{ applications: CandidateApplication[] }>("/api/applications");
  return data.applications;
}

export async function fetchCandidates(): Promise<Candidate[]> {
  const data = await request<{ candidates: Candidate[] }>("/api/candidates");
  return data.candidates;
}

export async function fetchCandidate(id: string): Promise<{ candidate: Candidate; events: CandidateEvent[] }> {
  return request<{ candidate: Candidate; events: CandidateEvent[] }>(`/api/candidates/${id}`);
}

export async function updateCandidateProfile(id: string, updates: Partial<Candidate>): Promise<Candidate> {
  const data = await request<{ candidate: Candidate }>(`/api/candidates/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(updates)
  });
  return data.candidate;
}

export async function revealCandidateIdentity(id: string, reason: string = "Recruiter evaluation"): Promise<Candidate> {
  const data = await request<{ candidate: Candidate; revealed: boolean }>(`/api/candidates/${id}/reveal`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ candidateId: id, reason })
  });
  return data.candidate;
}

export async function executeNaturalSearch(query: string): Promise<NaturalSearchResult> {
  return request<NaturalSearchResult>("/api/search/natural", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ query })
  });
}

export async function rediscoverTalent(jobId?: string, query?: string, minScore: number = 60): Promise<RediscoveryResponse> {
  return request<RediscoveryResponse>("/api/rediscovery", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ jobId, query, minScore })
  });
}

export async function fetchJobMatches(jobId: string): Promise<{ job: JobOpening; matches: Array<{ candidate: Candidate; match: CandidateJobMatch }> }> {
  return request<{ job: JobOpening; matches: Array<{ candidate: Candidate; match: CandidateJobMatch }> }>(`/api/jobs/${jobId}/matches`);
}

export async function compareCandidates(candidateIds: string[], jobId?: string): Promise<{
  job: any;
  evaluations: Array<{ candidate: Candidate; match: CandidateJobMatch }>;
  recommendation: string;
}> {
  return request<{
    job: any;
    evaluations: Array<{ candidate: Candidate; match: CandidateJobMatch }>;
    recommendation: string;
  }>("/api/candidates/compare", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ candidateIds, jobId })
  });
}

export async function fetchTalentPools(): Promise<TalentPool[]> {
  const data = await request<{ pools: TalentPool[] }>("/api/talent-pools");
  return data.pools;
}

export async function createTalentPool(name: string, description: string): Promise<TalentPool> {
  const data = await request<{ pool: TalentPool }>("/api/talent-pools", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name, description })
  });
  return data.pool;
}

export async function addToTalentPool(poolId: string, candidateIds: string[]): Promise<number> {
  const data = await request<{ addedCount: number }>(`/api/talent-pools/${poolId}/members`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ candidateIds })
  });
  return data.addedCount;
}

export async function removeFromTalentPool(poolId: string, candidateId: string): Promise<void> {
  await request<void>(`/api/talent-pools/${poolId}/members/${candidateId}`, { method: "DELETE" });
}

export async function sendCopilotMessage(input: {
  message: string;
  activeCandidateId?: string;
  activeJobId?: string;
}): Promise<{
  role: "assistant";
  content: string;
  toolCalls?: Array<{ tool: string; status: string; count?: number; entities?: string[] }>;
  actionSuggestions?: string[];
}> {
  return request<{
    role: "assistant";
    content: string;
    toolCalls?: Array<{ tool: string; status: string; count?: number; entities?: string[] }>;
    actionSuggestions?: string[];
  }>("/api/copilot/chat", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input)
  });
}

export async function fetchProcessingQueue(): Promise<ProcessingJob[]> {
  const data = await request<{ jobs: ProcessingJob[] }>("/api/queue/jobs");
  return data.jobs;
}

export async function mergeDuplicateCandidates(primaryId: string, secondaryId: string): Promise<{ status: string }> {
  return request<{ status: string }>("/api/duplicates/merge", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ primaryCandidateId: primaryId, secondaryCandidateId: secondaryId })
  });
}

export async function deleteCandidate(candidateId: string): Promise<void> {
  await request<void>(`/api/candidates/${candidateId}`, { method: "DELETE" });
}

export async function fetchReport(): Promise<ReportSummary> {
  const data = await request<{ report: ReportSummary }>("/api/reports/summary");
  return data.report;
}

export async function downloadReport(format: "csv" | "json"): Promise<void> {
  const response = await fetch(`/api/reports/export?format=${format}`, { headers: authHeaders() });
  if (!response.ok) {
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await response.json() : undefined;
    throw new Error(data?.message ?? `Report download failed with ${response.status}`);
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `resume-report.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function uploadResumes(files: File[], metadata: { role: string; source: string }): Promise<UploadResult> {
  const storageClient = supabase;
  if (isSupabaseBrowserConfigured && storageClient && accessToken) {
    try {
      const manifest = await request<SignedUploadManifest>("/api/uploads/sign", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          files: files.map((file) => ({ name: file.name, size: file.size, mimeType: file.type }))
        })
      });

      await runWithConcurrency(manifest.uploads, 4, async (upload, index) => {
        const file = files[index];
        if (!file) {
          throw new Error("The upload manifest did not match the selected files.");
        }
        const { error } = await storageClient.storage.from("resumes").uploadToSignedUrl(upload.path, upload.token, file, {
          contentType: file.type || undefined
        });
        if (error) {
          throw new Error(`Could not upload ${file.name}: ${error.message}`);
        }
      });

      return await request<UploadResult>("/api/uploads/process", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          completionToken: manifest.completionToken,
          role: metadata.role,
          source: metadata.source
        })
      });
    } catch (signedErr) {
      console.warn("Signed upload failed, falling back to server multipart upload:", signedErr);
    }
  }

  const form = new FormData();
  files.forEach((file) => form.append("resumes", file));
  form.append("role", metadata.role || "Open application");
  form.append("source", metadata.source || "Direct upload");

  return request<UploadResult>("/api/applications", {
    method: "POST",
    body: form
  });
}

interface SignedUploadManifest {
  uploads: Array<{
    path: string;
    name: string;
    size: number;
    mimeType: string;
    token: string;
    signedUrl?: string;
  }>;
  completionToken: string;
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await operation(values[index], index);
    }
  });
  await Promise.all(workers);
}

export async function fetchGmailStatus(): Promise<GmailStatus> {
  const data = await request<{ gmail: GmailStatus }>("/api/integrations/gmail/status");
  return data.gmail;
}

export async function fetchGmailAuthUrl(): Promise<string> {
  const data = await request<{ url: string }>("/api/integrations/gmail/auth-url");
  return data.url;
}

export async function importGmailResumes(input: {
  query: string;
  role: string;
  maxResults: number;
  fullSync?: boolean;
}): Promise<GmailImportResult> {
  return request<GmailImportResult>("/api/integrations/gmail/import", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input)
  });
}

export async function disconnectGmail(): Promise<GmailStatus> {
  const data = await request<{ gmail: GmailStatus }>("/api/integrations/gmail/disconnect", {
    method: "POST"
  });
  return data.gmail;
}

export async function updateApplication(
  id: string,
  updates: Partial<Pick<CandidateApplication, "status" | "notes" | "tags" | "role" | "source" | "location" | "primarySkill" | "primarySkillKey">>
): Promise<CandidateApplication> {
  const data = await request<{ application: CandidateApplication }>(`/api/applications/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(updates)
  });
  return data.application;
}

export async function bulkUpdateApplications(
  ids: string[],
  updates: Partial<{
    status: ApplicationStatus;
    primarySkill: string;
    primarySkillKey: string;
    location: string;
    city: string;
    region: string;
    country: string;
    notes: string;
    tags: string[];
    role: string;
    source: string;
  }>
): Promise<{ applications: CandidateApplication[]; updatedCount: number }> {
  return request<{ applications: CandidateApplication[]; updatedCount: number }>("/api/applications/bulk-update", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ ids, updates })
  });
}

export async function bulkDeleteApplications(ids: string[]): Promise<number> {
  const data = await request<{ deletedCount: number }>("/api/applications/bulk-delete", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ ids })
  });
  return data.deletedCount;
}

export async function fetchJobs(): Promise<JobOpening[]> {
  const data = await request<{ jobs: JobOpening[] }>("/api/jobs");
  return data.jobs;
}

export async function createJob(input: {
  title: string;
  department: string;
  location: string;
  description: string;
}): Promise<JobOpening> {
  const data = await request<{ job: JobOpening }>("/api/jobs", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input)
  });
  return data.job;
}

export async function fetchEligibleCandidates(): Promise<EligibleCandidate[]> {
  const data = await request<{ candidates: EligibleCandidate[] }>("/api/campaigns/eligible");
  return data.candidates;
}

export async function fetchCampaigns(): Promise<EmailCampaign[]> {
  const data = await request<{ campaigns: EmailCampaign[] }>("/api/campaigns");
  return data.campaigns;
}

export async function createCampaign(input: {
  jobId?: string;
  title: string;
  subject: string;
  body: string;
  applicationIds?: string[];
  customRecipients?: Array<{ candidateName?: string; email: string; role?: string }>;
}): Promise<{ campaign: EmailCampaign; providerConfigured: boolean }> {
  return request<{ campaign: EmailCampaign; providerConfigured: boolean }>("/api/campaigns", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input)
  });
}

export async function fetchTeamMembers(): Promise<{ members: TeamMember[]; currentUserRole: TeamMember["role"] }> {
  return request<{ members: TeamMember[]; currentUserRole: TeamMember["role"] }>("/api/team/members");
}

export async function inviteTeamMember(email: string, role: "admin" | "recruiter" | "hiring_manager" | "viewer"): Promise<TeamMember> {
  const data = await request<{ member: TeamMember }>("/api/team/invitations", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, role })
  });
  return data.member;
}

export async function provisionUserAccount(payload: ProvisionUserPayload): Promise<ProvisionUserResult> {
  return request<ProvisionUserResult>("/api/team/provision", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
}

export async function completePasswordChange(): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>("/api/auth/complete-password-change", {
    method: "POST",
    headers: jsonHeaders
  });
}

export async function removeTeamMember(userId: string): Promise<void> {
  await request<void>(`/api/team/members/${userId}`, { method: "DELETE" });
}

export async function fetchCandidateGraph(candidateId: string): Promise<TalentGraphData> {
  return request<TalentGraphData>(`/api/candidates/${candidateId}/graph`);
}

export async function fetchTalentNetworkGraph(): Promise<TalentGraphData> {
  return request<TalentGraphData>("/api/talent-graph");
}

export async function fetchAgencyClients(): Promise<{ clients: AgencyClient[] }> {
  return request<{ clients: AgencyClient[] }>("/api/agency/clients");
}

export async function fetchAgencyOverview(): Promise<AgencyOverview> {
  return request<AgencyOverview>("/api/agency/overview");
}

export async function createAgencyClient(payload: Partial<AgencyClient>): Promise<{ client: AgencyClient }> {
  return request<{ client: AgencyClient }>("/api/agency/clients", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
}

export async function switchAgencyClient(clientId: string): Promise<{ activeClientId: string; activeClient?: AgencyClient }> {
  return request<{ activeClientId: string; activeClient?: AgencyClient }>(`/api/agency/clients/${clientId}/switch`, {
    method: "POST"
  });
}

// 1. Interviews & Scorecards
export async function fetchInterviews(): Promise<InterviewPlan[]> {
  const data = await request<{ interviews: InterviewPlan[] }>("/api/interviews");
  return data.interviews;
}

export async function scheduleInterview(payload: Partial<InterviewPlan>): Promise<InterviewPlan> {
  const data = await request<{ interview: InterviewPlan }>("/api/interviews", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return data.interview;
}

export async function submitScorecard(payload: Partial<InterviewScorecard>): Promise<InterviewScorecard> {
  const data = await request<{ scorecard: InterviewScorecard }>(`/api/interviews/${payload.interviewPlanId}/scorecard`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return data.scorecard;
}

export async function fetchCandidateInterviews(candidateId: string): Promise<{
  interviews: InterviewPlan[];
  scorecards: InterviewScorecard[];
}> {
  return request<{ interviews: InterviewPlan[]; scorecards: InterviewScorecard[] }>(`/api/candidates/${candidateId}/interviews`);
}

// 2. Pipeline & Stage History
export async function moveCandidatePipelineStage(
  candidateId: string,
  toStage: ApplicationStatus,
  reason: string = "Recruiter pipeline movement",
  jobId?: string
): Promise<{ success: boolean; candidate: Candidate; stageHistory: CandidateStageHistory }> {
  return request<{ success: boolean; candidate: Candidate; stageHistory: CandidateStageHistory }>("/api/pipeline/move", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ candidateId, toStage, reason, jobId })
  });
}

export async function fetchCandidateStageHistory(candidateId: string): Promise<CandidateStageHistory[]> {
  const data = await request<{ history: CandidateStageHistory[] }>(`/api/candidates/${candidateId}/stage-history`);
  return data.history;
}

// 3. Offers & Onboarding
export async function fetchOffers(): Promise<JobOffer[]> {
  const data = await request<{ offers: JobOffer[] }>("/api/offers");
  return data.offers;
}

export async function createJobOffer(payload: Partial<JobOffer>): Promise<JobOffer> {
  const data = await request<{ offer: JobOffer }>("/api/offers", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return data.offer;
}

export async function updateJobOfferStatus(offerId: string, status: JobOffer["status"]): Promise<JobOffer> {
  const data = await request<{ offer: JobOffer }>(`/api/offers/${offerId}/status`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ status })
  });
  return data.offer;
}

export async function fetchOnboardingRecords(): Promise<OnboardingRecord[]> {
  const data = await request<{ records: OnboardingRecord[] }>("/api/onboarding");
  return data.records;
}

export async function updateOnboardingRecord(
  onboardingId: string,
  updates: Partial<OnboardingRecord>
): Promise<OnboardingRecord> {
  const data = await request<{ record: OnboardingRecord }>(`/api/onboarding/${onboardingId}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(updates)
  });
  return data.record;
}

// 4. Recruiter Match Feedback
export async function submitRecruiterMatchFeedback(payload: {
  candidateId: string;
  jobId: string;
  overrideScore: number;
  feedbackCategory?: string;
  comments: string;
}): Promise<RecruiterFeedback> {
  const data = await request<{ feedback: RecruiterFeedback }>("/api/matching/feedback", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return data.feedback;
}

// 5. Agency Client Jobs, Shortlists & Billing
export async function fetchClientJobs(clientId: string): Promise<ClientJob[]> {
  const data = await request<{ jobs: ClientJob[] }>(`/api/agency/clients/${clientId}/jobs`);
  return data.jobs;
}

export async function createClientJob(payload: Partial<ClientJob>): Promise<ClientJob> {
  const data = await request<{ job: ClientJob }>(`/api/agency/clients/${payload.clientId}/jobs`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return data.job;
}

export async function shareCandidateWithClient(payload: {
  clientId: string;
  candidateId: string;
  jobId?: string;
}): Promise<ClientShortlist> {
  const data = await request<{ shortlist: ClientShortlist }>("/api/agency/shortlists/share", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return data.shortlist;
}

export async function recordClientFeedback(
  shortlistId: string,
  status: ClientShortlist["clientStatus"],
  feedback: string
): Promise<ClientShortlist> {
  const data = await request<{ shortlist: ClientShortlist }>(`/api/agency/shortlists/${shortlistId}/feedback`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ status, feedback })
  });
  return data.shortlist;
}

export async function fetchPlacements(): Promise<PlacementRecord[]> {
  const data = await request<{ placements: PlacementRecord[] }>("/api/agency/placements");
  return data.placements;
}

export async function recordPlacement(payload: Partial<PlacementRecord>): Promise<PlacementRecord> {
  const data = await request<{ placement: PlacementRecord }>("/api/agency/placements", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return data.placement;
}

export async function fetchAgencyInvoices(): Promise<AgencyInvoice[]> {
  const data = await request<{ invoices: AgencyInvoice[] }>("/api/agency/invoices");
  return data.invoices;
}

export async function generateInvoice(payload: Partial<AgencyInvoice>): Promise<AgencyInvoice> {
  const data = await request<{ invoice: AgencyInvoice }>("/api/agency/invoices", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return data.invoice;
}

// 6. Compliance, GDPR/DPDP, Data Export & Deletion
export async function exportComplianceData(
  exportType: "candidates_full" | "audit_logs" | "compliance_dump" = "candidates_full",
  format: "json" | "csv" = "json"
): Promise<{ exportId: string; downloadUrl: string; rowCount: number; message: string }> {
  return request<{ exportId: string; downloadUrl: string; rowCount: number; message: string }>("/api/compliance/export", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ exportType, format })
  });
}

export async function executeComplianceDeletion(
  candidateId: string,
  reason: string = "Candidate GDPR Right to be forgotten request"
): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>("/api/compliance/delete-candidate", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ candidateId, reason })
  });
}

export async function fetchRetentionPolicies(): Promise<RetentionPolicy[]> {
  const data = await request<{ policies: RetentionPolicy[] }>("/api/compliance/retention-policies");
  return data.policies;
}

export async function createRetentionPolicy(payload: Partial<RetentionPolicy>): Promise<RetentionPolicy> {
  const data = await request<{ policy: RetentionPolicy }>("/api/compliance/retention-policies", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return data.policy;
}



async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers ?? {})
    }
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : undefined;

  if (!response.ok) {
    throw new Error(data?.message ?? `Request failed with ${response.status}`);
  }

  return data as T;
}

function authHeaders(): HeadersInit {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}
