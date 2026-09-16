export const STATUS_LABELS = {
  new: "New",
  needs_review: "Needs review",
  shortlisted: "Shortlisted",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  hold: "Hold",
  rejected: "Rejected"
} as const;

export type ApplicationStatus = keyof typeof STATUS_LABELS;

export interface SkillCategory {
  key: string;
  label: string;
  description: string;
  accent: string;
  keywordCount: number;
}

export interface CandidateSkill {
  skillName: string;
  normalizedSkill: string;
  category: string;
  proficiency: "Expert" | "Proficient" | "Working Knowledge" | string;
  yearsExperience: number | null;
  evidenceText: string;
  confidence: number;
}

export interface CandidateExperience {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
  confidence: number;
}

export interface CandidateEducation {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  confidence: number;
}

export interface Candidate {
  id: string;
  canonicalName: string;
  blindId: string;
  email: string;
  phone: string;
  location: string;
  city: string;
  region: string;
  country: string;
  currentTitle: string;
  currentCompany: string;
  profileSummary: string;
  experienceYears: number | null;
  primaryDomain: string;
  primaryDomainKey: string;
  matchedSkills: string[];
  skills: CandidateSkill[];
  experiences: CandidateExperience[];
  educations: CandidateEducation[];
  dataQualityScore: number;
  qualityBreakdown?: {
    identity: number;
    skills: number;
    experience: number;
    education: number;
    location: number;
  };
  seniority?: string;
  consentStatus: string;
  status: ApplicationStatus;
  role: string;
  source: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  applicationIds: string[];
}

export interface CandidateEvent {
  id: string;
  candidateId: string;
  eventType: string;
  actorId: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface CandidateJobMatch {
  overallScore: number;
  scoreBreakdown: {
    requiredSkills: { earned: number; max: number };
    preferredSkills: { earned: number; max: number };
    experience: { earned: number; max: number };
    education: { earned: number; max: number };
    semantic: { earned: number; max: number };
    location: { earned: number; max: number };
  };
  matchedSkills: string[];
  missingSkills: string[];
  evidence: Array<{ skill: string; status: string; evidence: string }>;
  interviewQuestions: string[];
  recommendation: string;
  confidence: number;
}

export interface RediscoveryResult {
  candidate: Candidate;
  match: CandidateJobMatch;
  historicalTag: string;
  rediscoveryReason: string;
  overallScore: number;
}

export interface RediscoveryResponse {
  jobTitle: string;
  metrics: {
    totalSearched: number;
    strongMatches: number;
    previouslyInterviewed: number;
    previouslyShortlisted: number;
    otherHistorical: number;
  };
  results: RediscoveryResult[];
}

export interface TalentPool {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  memberCount: number;
}

export interface ProcessingJob {
  id: string;
  jobType: string;
  status: "completed" | "processing" | "pending" | "failed";
  attempts: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ tool: string; status: string; count?: number; entities?: string[] }>;
  actionSuggestions?: string[];
  timestamp: string;
}

export interface NaturalSearchResult {
  query: string;
  parsedCriteria: {
    skills: string[];
    minExperience: number | null;
    location: string;
    seniority: string;
  };
  results: Array<{
    candidate: Candidate;
    relevanceScore: number;
    reasons: string[];
  }>;
  totalFound: number;
}

export interface CandidateApplication {
  id: string;
  candidateName: string;
  email: string;
  phone: string;
  location: string;
  city: string;
  region: string;
  country: string;
  locationConfidence: number;
  primarySkill: string;
  primarySkillKey: string;
  skillScores: Record<string, number>;
  skillScorePercent: number;
  matchedSkills: string[];
  experienceYears: number | null;
  summary: string;
  textPreview: string;
  resumeTextLength: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  updatedAt: string;
  source: string;
  role: string;
  status: ApplicationStatus;
  notes: string;
  tags: string[];
  duplicateOf: string | null;
}

export interface ReportSummary {
  total: number;
  uploadedToday: number;
  needsReview: number;
  duplicateCount: number;
  averageSkillScore: number;
  bySkill: Array<{ key: string; label: string; count: number }>;
  byLocation: Array<{ location: string; count: number }>;
  byStatus: Array<{ status: ApplicationStatus; count: number }>;
  topSkills: Array<{ skill: string; count: number }>;
  recentUploads: CandidateApplication[];
}

export interface TaxonomyResponse {
  skillCategories: SkillCategory[];
  statuses: ApplicationStatus[];
}

export interface UploadResult {
  applications: CandidateApplication[];
  failures: Array<{ fileName: string; message: string }>;
  message: string;
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  email: string;
  updatedAt: string;
  defaultQuery: string;
  message: string;
  redirectUri?: string;
  missingKeys?: string[];
}

export interface GmailImportResult {
  applications: CandidateApplication[];
  failures: Array<{ fileName: string; message: string }>;
  importedCount: number;
  scannedMessages: number;
  skippedAttachments: number;
  message: string;
}

export interface JobOpening {
  id: string;
  title: string;
  department: string;
  location: string;
  description: string;
  status: "draft" | "open" | "closed" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface EligibleCandidate {
  applicationId: string;
  candidateName: string;
  email: string;
  role: string;
  status: string;
  primarySkill: string;
}

export interface EmailCampaign {
  id: string;
  title: string;
  subject: string;
  body: string;
  status: "draft" | "sending" | "sent" | "failed";
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  sentAt: string | null;
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  email: string;
  fullName: string;
  role: "owner" | "admin" | "recruiter" | "hiring_manager" | "viewer";
  joinedAt: string;
  invited?: boolean;
  mustChangePassword?: boolean;
  temporaryPassword?: string;
}

export interface ProvisionUserPayload {
  email: string;
  fullName?: string;
  role: "admin" | "recruiter" | "hiring_manager" | "viewer";
  temporaryPassword?: string;
}

export interface ProvisionUserResult {
  member: TeamMember;
  emailSent: boolean;
  temporaryPassword: string;
  organizationName: string;
}

export interface FilterState {
  query: string;
  skill: string;
  location: string;
  status: string;
  experienceMin?: number;
  dataQualityMin?: number;
}

export type SortKey = "lastActivityAt" | "uploadedAt" | "skillScorePercent" | "candidateName" | "location" | "status" | "experienceYears";

export interface TalentGraphNode {
  id: string;
  label: string;
  type: "candidate" | "skill" | "company" | "role" | "education" | "location" | "job" | "interview" | "similar_candidate" | string;
  category?: string;
  proficiency?: string;
  entity?: string;
  currentTitle?: string;
  location?: string;
  experienceYears?: number;
  similarityScore?: number;
  reasons?: string[];
  department?: string;
  matchScore?: number;
  [key: string]: unknown;
}

export interface TalentGraphLink {
  source: string;
  target: string;
  relation: "HAS_SKILL" | "WORKED_AT" | "HELD_ROLE" | "STUDIED_AT" | "BASED_IN" | "APPLIED_TO" | "INTERVIEW_HISTORY" | "SIMILAR_TO" | string;
  label?: string;
  weight?: number;
}

export interface TalentGraphData {
  candidateId?: string;
  nodes: TalentGraphNode[];
  links: TalentGraphLink[];
  metrics?: {
    totalNodes: number;
    totalRelationships: number;
    skillsCount: number;
    companiesCount: number;
    similarCandidatesCount: number;
  };
  summary?: {
    candidatesAnalyzed: number;
    connectedSkills: number;
    alumniCompanies: number;
    graphDensity: number;
  };
  similarCandidates?: Array<{
    candidate: Candidate;
    similarityScore: number;
    reasons: string[];
  }>;
}

export interface AgencyClient {
  id: string;
  code: string;
  name: string;
  industry: string;
  openJobsCount: number;
  candidatePoolCount: number;
  recruiterCount: number;
  tier: string;
  slaHours: number;
  primaryRecruiter: string;
  assignedRecruiters: string[];
  status: string;
  avgPlacementDays: number;
  recentVacancies: string[];
}

export interface AgencyOverview {
  totalClients: number;
  totalOpenJobs: number;
  totalCandidateIntelligence: number;
  totalAgencyRecruiters: number;
  activeClientId: string;
  clients: AgencyClient[];
}
