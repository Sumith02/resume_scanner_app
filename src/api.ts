import type {
  AgencyClient,
  AgencyOverview,
  ApplicationStatus,
  Candidate,
  CandidateApplication,
  CandidateEvent,
  CandidateJobMatch,
  EligibleCandidate,
  EmailCampaign,
  GmailImportResult,
  GmailStatus,
  JobOpening,
  NaturalSearchResult,
  ProcessingJob,
  RediscoveryResponse,
  ReportSummary,
  TalentGraphData,
  TalentPool,
  TeamMember,
  TaxonomyResponse,
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
  if (isSupabaseBrowserConfigured && storageClient) {
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

    return request<UploadResult>("/api/uploads/process", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        completionToken: manifest.completionToken,
        role: metadata.role,
        source: metadata.source
      })
    });
  }

  const form = new FormData();
  files.forEach((file) => form.append("resumes", file));
  form.append("role", metadata.role);
  form.append("source", metadata.source);

  return request<UploadResult>("/api/applications", {
    method: "POST",
    headers: authHeaders(),
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
