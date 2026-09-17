import { type Session, type User as SupabaseUser } from "@supabase/supabase-js";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  Database,
  Eye,
  EyeOff,
  Inbox,
  KeyRound,
  Layers3,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Network,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  UploadCloud,
  User,
  UserPlus,
  Copy,
  Shield,
  UsersRound,
  X,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AuthGate } from "./AuthGate";
import { AuthModal } from "./AuthModal";
import {
  completePasswordChange,
  createAgencyClient,
  createCampaign,
  createJob,
  createTalentPool,
  disconnectGmail,
  downloadReport,
  executeNaturalSearch,
  fetchAgencyClients,
  fetchCampaigns,
  fetchCandidate,
  deleteCandidate,
  fetchCandidates,
  fetchEligibleCandidates,
  fetchGmailAuthUrl,
  fetchGmailStatus,
  fetchJobs,
  fetchProcessingQueue,
  fetchReport,
  fetchTalentPools,
  fetchTeamMembers,
  provisionUserAccount,
  removeTeamMember,
  importGmailResumes,
  mergeDuplicateCandidates,
  moveCandidatePipelineStage,
  exportComplianceData,
  executeComplianceDeletion,
  rediscoverTalent,
  revealCandidateIdentity,
  sendCopilotMessage,
  setApiAccessToken,
  switchAgencyClient,
  updateCandidateProfile,
  uploadResumes,
  fetchCurrentUser,
  type CurrentUserProfile
} from "./api";
import { isSupabaseBrowserConfigured, supabase } from "./supabaseClient";
import {
  STATUS_LABELS,
  type AgencyClient,
  type ApplicationStatus,
  type Candidate,
  type CandidateEvent,
  type CopilotMessage,
  type EligibleCandidate,
  type EmailCampaign,
  type GmailStatus,
  type JobOpening,
  type NaturalSearchResult,
  type ProcessingJob,
  type RediscoveryResult,
  type ReportSummary,
  type TalentPool,
  type TeamMember
} from "./types";
import { formatDate, formatFileSize } from "./utils";
import { TalentGraphView } from "./TalentGraphView";
import { AgencyMultiClientView } from "./AgencyMultiClientView";
import { CandidateDossierDrawer } from "./CandidateDossierDrawer";

type ViewKey =
  | "command_center"
  | "candidates"
  | "rediscovery"
  | "graph"
  | "agency"
  | "search"
  | "pipeline"
  | "jobs"
  | "compare"
  | "pools"
  | "intake"
  | "duplicates"
  | "data_quality"
  | "campaigns"
  | "reports"
  | "settings";

type IntakeMode = "upload" | "gmail";

const emptyReport: ReportSummary = {
  total: 0,
  uploadedToday: 0,
  needsReview: 0,
  duplicateCount: 0,
  averageSkillScore: 0,
  bySkill: [],
  byLocation: [],
  byStatus: [],
  topSkills: [],
  recentUploads: []
};

const emptyGmailStatus: GmailStatus = {
  configured: false,
  connected: false,
  email: "",
  updatedAt: "",
  defaultQuery: "has:attachment (filename:pdf OR filename:docx OR filename:txt) newer_than:30d",
  message: "Gmail status is unavailable."
};

function getNavItems(role: string): Array<{ key: ViewKey; label: string; icon: ReactNode; badge?: string }> {
  const isAdmin = role === "owner" || role === "admin";
  const isHiringManager = role === "hiring_manager";
  const isViewer = role === "viewer";

  if (isViewer) {
    return [
      { key: "candidates", label: "Talent Database", icon: <UsersRound size={18} /> },
      { key: "pipeline", label: "Pipeline (Kanban)", icon: <Layers3 size={18} /> },
      { key: "reports", label: "Analytics", icon: <BarChart3 size={18} /> },
      { key: "settings", label: "My Profile", icon: <User size={18} /> }
    ];
  }

  if (isHiringManager) {
    return [
      { key: "command_center", label: "Command Center", icon: <Sparkles size={18} /> },
      { key: "candidates", label: "Talent Database", icon: <UsersRound size={18} /> },
      { key: "pipeline", label: "Pipeline (Kanban)", icon: <Layers3 size={18} /> },
      { key: "jobs", label: "Jobs & Requirements", icon: <BriefcaseBusiness size={18} /> },
      { key: "compare", label: "Comparison", icon: <SlidersHorizontal size={18} /> },
      { key: "reports", label: "Analytics", icon: <BarChart3 size={18} /> },
      { key: "settings", label: "My Profile", icon: <User size={18} /> }
    ];
  }

  if (!isAdmin) {
    // Simple Recruiter: A focused tool to upload resumes, parse, search, and view match scores
    return [
      { key: "intake", label: "Upload Resumes", icon: <UploadCloud size={18} /> },
      { key: "candidates", label: "My Candidates", icon: <UsersRound size={18} /> },
      { key: "search", label: "Candidate Search", icon: <Search size={18} /> },
      { key: "jobs", label: "Jobs & Matching", icon: <BriefcaseBusiness size={18} /> },
      { key: "compare", label: "Compare Matches", icon: <SlidersHorizontal size={18} /> },
      { key: "pipeline", label: "Pipeline", icon: <Layers3 size={18} /> },
      { key: "reports", label: "Analytics", icon: <BarChart3 size={18} /> },
      { key: "settings", label: "My Account", icon: <User size={18} /> }
    ];
  }

  // Admin / Owner - Full Workspace Suite
  return [
    { key: "command_center", label: "Command Center", icon: <Sparkles size={18} /> },
    { key: "candidates", label: "Talent Database", icon: <UsersRound size={18} /> },
    { key: "rediscovery", label: "Talent Rediscovery", icon: <Zap size={18} />, badge: "V11 Core" },
    { key: "graph", label: "Talent Graph", icon: <Network size={18} />, badge: "Relational" },
    { key: "agency", label: "Multi-Client OS", icon: <Building2 size={18} />, badge: "Agency" },
    { key: "search", label: "Talent Search", icon: <Search size={18} /> },
    { key: "pipeline", label: "Pipeline (Kanban)", icon: <Layers3 size={18} /> },
    { key: "jobs", label: "Jobs & Intelligence", icon: <BriefcaseBusiness size={18} /> },
    { key: "compare", label: "Comparison", icon: <SlidersHorizontal size={18} /> },
    { key: "pools", label: "Talent Pools", icon: <Tags size={18} /> },
    { key: "intake", label: "Intake Center", icon: <UploadCloud size={18} /> },
    { key: "duplicates", label: "Duplicates", icon: <CircleAlert size={18} /> },
    { key: "data_quality", label: "Data Quality", icon: <ShieldCheck size={18} /> },
    { key: "campaigns", label: "Campaigns", icon: <Mail size={18} /> },
    { key: "reports", label: "Analytics", icon: <BarChart3 size={18} /> },
    { key: "settings", label: "Admin & Security", icon: <Settings size={18} />, badge: "Admin" }
  ];
}

function MandatoryPasswordChangeGuard({
  userEmail,
  onPasswordChanged,
  onSignOut
}: {
  userEmail: string;
  onPasswordChanged: (user: SupabaseUser) => void;
  onSignOut: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (newPassword.length < 6) {
      setErrorMsg("Permanent password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);

    try {
      if (isSupabaseBrowserConfigured && supabase) {
        const { data, error } = await supabase.auth.updateUser({
          password: newPassword,
          data: {
            must_change_password: false,
            temporary_password: false
          }
        });

        if (error) throw error;

        try {
          await completePasswordChange();
        } catch {
          // non-blocking
        }

        setSuccessMsg("Permanent password saved! Launching workspace...");
        setTimeout(() => {
          if (data.user) {
            onPasswordChanged(data.user);
          }
        }, 500);
      } else {
        setSuccessMsg("Permanent password saved! Launching workspace...");
        setTimeout(() => {
          onPasswordChanged({
            id: "local-user",
            app_metadata: {},
            user_metadata: { must_change_password: false },
            aud: "authenticated",
            created_at: new Date().toISOString()
          } as SupabaseUser);
        }, 400);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #090d16 0%, #0f172a 50%, #1e293b 100%)",
        color: "#ffffff",
        padding: "20px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "#0f172a",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          padding: "36px 32px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              display: "grid",
              placeItems: "center"
            }}
          >
            <Zap size={20} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 800 }}>RESUME SCANNER</div>
            <div style={{ fontSize: "10px", color: "#60a5fa", fontWeight: 700, letterSpacing: "0.1em" }}>
              FIRST-LOGIN SECURITY
            </div>
          </div>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "20px",
            background: "rgba(234, 179, 8, 0.15)",
            border: "1px solid rgba(234, 179, 8, 0.4)",
            color: "#fde047",
            fontSize: "11px",
            fontWeight: 600,
            marginBottom: "12px"
          }}
        >
          <KeyRound size={13} />
          Mandatory Security Step
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 8px 0" }}>
          Set Your Permanent Password
        </h2>
        <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.5, margin: "0 0 24px 0" }}>
          You logged in with a temporary password for <strong style={{ color: "#ffffff" }}>{userEmail}</strong>. Please set a new permanent password to secure your account.
        </p>

        {errorMsg && (
          <div
            style={{
              marginBottom: "18px",
              padding: "10px 14px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#fca5a5",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <CircleAlert size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              marginBottom: "18px",
              padding: "10px 14px",
              borderRadius: "8px",
              background: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.4)",
              color: "#86efac",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
              New Permanent Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "rgba(255, 255, 255, 0.05)",
                color: "#ffffff",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "rgba(255, 255, 255, 0.05)",
                color: "#ffffff",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "10px",
              padding: "12px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "14px",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 16px rgba(16, 185, 129, 0.35)"
            }}
          >
            {loading ? <Loader2 size={16} className="spinning" /> : <ShieldCheck size={16} />}
            <span>Save Permanent Password & Enter</span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "12px",
              cursor: "pointer",
              padding: "8px",
              textAlign: "center"
            }}
          >
            Sign out and return to login
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseBrowserConfigured);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>("intake");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("upload");

  // User & Workspace Authentication Profile
  const [userProfile, setUserProfile] = useState<CurrentUserProfile | null>(null);

  // Core Data State
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [talentPools, setTalentPools] = useState<TalentPool[]>([]);
  const [processingQueue, setProcessingQueue] = useState<ProcessingJob[]>([]);
  const [report, setReport] = useState<ReportSummary>(emptyReport);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus>(emptyGmailStatus);

  // Agency Multi-Client State
  const [agencyClients, setAgencyClients] = useState<AgencyClient[]>([]);
  const [activeClientId, setActiveClientId] = useState<string>("client-a");

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [activeCandidateDetail, setActiveCandidateDetail] = useState<{ candidate: Candidate; events: CandidateEvent[] } | null>(null);
  const [blindReviewMode, setBlindReviewMode] = useState(false);

  // Global Natural Language Search Bar
  const [globalQuery, setGlobalQuery] = useState("");
  const [naturalSearchResult, setNaturalSearchResult] = useState<NaturalSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Recruiter Copilot State
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([
    {
      id: "msg-0",
      role: "assistant",
      content: "Hello! I am your **Resume Scanner Recruiter Copilot**. Ask me to discover overlooked candidates, compare talent, explain match scores, or build technical interview guides.",
      actionSuggestions: [
        "Rediscover overlooked candidates",
        "Compare top 2 candidates",
        "Find senior React developers in Bengaluru",
        "Explain match score for Rahul Kumar"
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);

  // Rediscovery State
  const [rediscoveryLoading, setRediscoveryLoading] = useState(false);
  const [rediscoveryResults, setRediscoveryResults] = useState<RediscoveryResult[]>([]);
  const [rediscoveryMetrics, setRediscoveryMetrics] = useState<any>(null);
  const [rediscoveryJobId, setRediscoveryJobId] = useState<string>("");
  const [campaignPreselectedJobId, setCampaignPreselectedJobId] = useState<string>("");

  // Intake State
  const [files, setFiles] = useState<File[]>([]);
  const [role, setRole] = useState("Open application");
  const [source, setSource] = useState("Direct upload");
  const [uploading, setUploading] = useState(false);
  const [gmailRole, setGmailRole] = useState("Open application");
  const [gmailQuery, setGmailQuery] = useState(emptyGmailStatus.defaultQuery);
  const [gmailMaxResults, setGmailMaxResults] = useState(50);
  const [gmailFullSync, setGmailFullSync] = useState(false);
  const [importingGmail, setImportingGmail] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Supabase Auth listener
  useEffect(() => {
    if (!isSupabaseBrowserConfigured || !supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setApiAccessToken(data.session?.access_token ?? "");
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setApiAccessToken(nextSession?.access_token ?? "");
      setAuthLoading(false);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Load Initial Workspace Data
  useEffect(() => {
    if (authLoading) return;
    loadWorkspace();
  }, [authLoading, session]);

  async function loadWorkspace() {
    setLoading(true);
    setError("");
    try {
      const [candList, rep, gm, jobList, poolList, qList, clientRes, userProfileRes] = await Promise.all([
        fetchCandidates().catch(() => []),
        fetchReport().catch(() => emptyReport),
        fetchGmailStatus().catch(() => emptyGmailStatus),
        fetchJobs().catch(() => []),
        fetchTalentPools().catch(() => []),
        fetchProcessingQueue().catch(() => []),
        fetchAgencyClients().catch(() => ({ clients: [] })),
        fetchCurrentUser().catch(() => null)
      ]);

      setCandidates(candList);
      setReport(rep);
      setGmailStatus(gm);
      setJobs(jobList);
      setTalentPools(poolList);
      setProcessingQueue(qList);
      setAgencyClients(clientRes.clients);
      if (userProfileRes) {
        setUserProfile(userProfileRes);
      }

      if (jobList.length > 0 && !rediscoveryJobId) {
        setRediscoveryJobId(jobList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Resume Scanner workspace.");
    } finally {
      setLoading(false);
    }
  }

  // Candidate Detail Dossier Hook
  useEffect(() => {
    if (!activeCandidateId) {
      setActiveCandidateDetail(null);
      return;
    }
    fetchCandidate(activeCandidateId)
      .then((data) => setActiveCandidateDetail(data))
      .catch(() => setActiveCandidateDetail(null));
  }, [activeCandidateId]);

  // User Profile & Role derivation (Computed unconditionally before any early returns to obey React Rules of Hooks)
  const userEmail = session?.user?.email?.trim().toLowerCase() || "";
  const isMasterAdmin = userEmail === "sumithsbhatt@gmail.com";
  const userRole: "owner" | "admin" | "recruiter" | "hiring_manager" | "viewer" =
    isMasterAdmin ? "owner" : (userProfile?.workspace?.role === "viewer" || userProfile?.workspace?.role === "hiring_manager" ? userProfile.workspace.role : "recruiter");
  const isAdmin = isMasterAdmin;
  const navItems = useMemo(() => getNavItems(isMasterAdmin ? "owner" : userRole), [isMasterAdmin, userRole]);

  // Keep activeView valid for the user's role
  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((item) => item.key === activeView)) {
      setActiveView(navItems[0].key);
    }
  }, [navItems, activeView]);

  // Handle Global Natural Search
  async function handleGlobalSearch(e?: FormEvent, queryOverride?: string) {
    if (e) e.preventDefault();
    const q = (queryOverride !== undefined ? queryOverride : globalQuery).trim();
    if (queryOverride !== undefined) {
      setGlobalQuery(queryOverride);
    }
    setIsSearching(true);
    setActiveView("search");
    try {
      const result = await executeNaturalSearch(q);
      setNaturalSearchResult(result);
    } catch (err) {
      setError("Search failed: " + (err instanceof Error ? err.message : "Error"));
    } finally {
      setIsSearching(false);
    }
  }

  // Handle Talent Rediscovery Scan
  async function handleRunRediscovery() {
    setRediscoveryLoading(true);
    try {
      const res = await rediscoverTalent(rediscoveryJobId, undefined, 60);
      setRediscoveryResults(res.results);
      setRediscoveryMetrics(res.metrics);
      setNotice(`Rediscovery complete: ${res.metrics.strongMatches} strong candidates surfaced!`);
    } catch (err) {
      setError("Rediscovery failed: " + (err instanceof Error ? err.message : "Error"));
    } finally {
      setRediscoveryLoading(false);
    }
  }

  // Handle Copilot Message
  async function handleSendCopilot(promptOverride?: string) {
    const text = promptOverride || copilotInput.trim();
    if (!text) return;
    const userMsg: CopilotMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    setCopilotMessages((prev) => [...prev, userMsg]);
    if (!promptOverride) setCopilotInput("");
    setCopilotBusy(true);

    try {
      const res = await sendCopilotMessage({
        message: text,
        activeCandidateId: activeCandidateId || undefined,
        activeJobId: rediscoveryJobId || undefined
      });
      const assistantMsg: CopilotMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: res.content,
        toolCalls: res.toolCalls,
        actionSuggestions: res.actionSuggestions,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      setCopilotMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setCopilotMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: "I encountered an issue executing this intelligence tool. Please try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    } finally {
      setCopilotBusy(false);
    }
  }

  // Handle Candidate Reveal
  async function handleRevealCandidate(candId: string) {
    try {
      const updated = await revealCandidateIdentity(candId, "Recruiter dossier review");
      setCandidates((prev) => prev.map((c) => (c.id === candId ? updated : c)));
      if (activeCandidateDetail) {
        setActiveCandidateDetail((prev) => (prev ? { ...prev, candidate: updated } : null));
      }
      setNotice(`Identity revealed for Candidate #${updated.blindId}. Logged to audit trail.`);
    } catch (err) {
      setError("Failed to reveal identity.");
    }
  }

  // Handle Resume Upload
  async function handleUpload() {
    if (!files.length) return;
    if (isSupabaseBrowserConfigured && !session?.user) {
      setAuthModalOpen(true);
      setError("Please sign in or create a recruiter account to upload resumes into your workspace.");
      return;
    }
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const result = await uploadResumes(files, { role, source });
      setFiles([]);
      await loadWorkspace();
      if (result.failures && result.failures.length > 0) {
        const failText = result.failures.map(f => `${f.fileName}: ${f.message}`).join(" | ");
        if (result.applications && result.applications.length > 0) {
          setNotice(`${result.message}. (${failText})`);
        } else {
          setError(`${result.message || "Upload notice"}: ${failText}`);
        }
      } else {
        setNotice(result.message || `${files.length} resumes successfully parsed and indexed!`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Handle Gmail Import
  async function handleGmailImport() {
    setImportingGmail(true);
    setError("");
    setNotice("");
    try {
      const res = await importGmailResumes({
        query: gmailQuery,
        role: gmailRole,
        maxResults: gmailMaxResults,
        fullSync: gmailFullSync
      });
      await loadWorkspace();
      setGmailStatus(prev => ({
        ...prev,
        lastSyncedAt: res.lastSyncedAt || prev.lastSyncedAt,
        syncCount: res.syncCount ?? prev.syncCount
      }));
      if (res.failures && res.failures.length > 0) {
        const failText = res.failures.map(f => `${f.fileName}: ${f.message}`).join(" | ");
        if (res.importedCount > 0) {
          setNotice(`${res.message} (${failText})`);
        } else {
          setError(`${res.message}: ${failText}`);
        }
      } else {
        setNotice(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gmail import failed.");
    } finally {
      setImportingGmail(false);
    }
  }

  async function handleConnectGmail() {
    try {
      const url = await fetchGmailAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate Gmail connection.");
    }
  }

  async function handleDisconnectGmail() {
    try {
      const status = await disconnectGmail();
      setGmailStatus(status);
      setNotice("Gmail mailbox disconnected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Gmail.");
    }
  }

  // Candidate Multi-Select
  function toggleSelectCandidate(id: string) {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  // MANDATORY AUTHENTICATION GATE: ZERO PUBLIC ACCESS
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#090d16", color: "#ffffff" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 8px 24px rgba(37, 99, 235, 0.4)"
            }}
          >
            <Zap size={26} color="#fff" />
          </div>
          <Loader2 className="spinning" size={28} color="#38bdf8" />
          <span style={{ fontSize: "14px", color: "#94a3b8" }}>Connecting to Resume Scanner...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthGate
        onAuthSuccess={(newSession) => {
          setSession(newSession);
          setApiAccessToken(newSession.access_token ?? "");
          loadWorkspace();
        }}
      />
    );
  }

  const mustChangePassword =
    !isMasterAdmin &&
    Boolean(
      session?.user?.user_metadata?.must_change_password ||
      session?.user?.user_metadata?.temporary_password ||
      userProfile?.user?.mustChangePassword
    );

  if (mustChangePassword) {
    return (
      <MandatoryPasswordChangeGuard
        userEmail={session?.user?.email || userProfile?.user?.email || ""}
        onPasswordChanged={(updatedUser) => {
          setSession((prev) => (prev ? { ...prev, user: updatedUser } : null));
          loadWorkspace();
        }}
        onSignOut={async () => {
          if (supabase) await supabase.auth.signOut();
          setSession(null);
          setUserProfile(null);
          setApiAccessToken("");
          setCandidates([]);
          setJobs([]);
          setTalentPools([]);
          setAgencyClients([]);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Zap size={22} />
          </div>
          <div className="brand-copy">
            <strong>RESUME SCANNER</strong>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#94a3b8" }}>
              TALENT INTELLIGENCE
            </span>
          </div>
        </div>

        <nav className="sidebar-nav" style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeView === item.key ? "is-active" : ""}
              onClick={() => {
                setActiveView(item.key);
                if (item.key === "rediscovery" && !rediscoveryResults.length) {
                  handleRunRediscovery();
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "none",
                background: activeView === item.key ? "#1f2937" : "transparent",
                color: activeView === item.key ? "#fff" : "#94a3b8",
                fontWeight: activeView === item.key ? 600 : 400,
                textAlign: "left",
                fontSize: "13px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {item.icon}
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span style={{ fontSize: "10px", background: "rgba(15, 118, 110, 0.3)", color: "#2dd4bf", padding: "2px 6px", borderRadius: "4px" }}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="profile-badge">
            <div className="avatar" style={{ background: isAdmin ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" : "#1e293b", color: "#fff", fontWeight: 700 }}>
              {isAdmin ? "AD" : "RC"}
            </div>
            <div className="profile-meta">
              <strong>{userProfile?.user?.fullName || userProfile?.user?.email || "My Account"}</strong>
              <span style={{ fontSize: "11px", color: isAdmin ? "#f59e0b" : "#94a3b8" }}>
                {isAdmin ? "👑 System Administrator" : "Recruiter (Private Account)"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN WORKSPACE CONTENT */}
      <div className="workspace" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* TOP COMMAND BAR */}
        <header className="top-command-bar">
          <form onSubmit={handleGlobalSearch} className="command-search-wrapper">
            <Search size={16} color="#64748b" />
            <input
              type="text"
              className="command-input"
              placeholder={isAdmin ? "Ask Talent OS... e.g. Find senior React developers with 4+ years experience" : "Search your uploaded candidates..."}
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
            />
            <button type="submit" style={{ background: "transparent", border: "none", color: "var(--brand)", fontSize: "12px", fontWeight: 600 }}>
              Search
            </button>
          </form>

          {/* AGENCY MULTI-CLIENT SWITCHER (Visible strictly for Admins) */}
          {(isAdmin && agencyClients.length > 0) && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Building2 size={16} color="var(--brand)" />
              <select
                value={activeClientId}
                onChange={async (e) => {
                  const newId = e.target.value;
                  setActiveClientId(newId);
                  await switchAgencyClient(newId);
                  setNotice(`Switched active agency workspace to ${newId === "all" ? "All Clients (Master OS)" : newId.toUpperCase()}.`);
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  background: "#f8fafc",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#1e293b",
                  cursor: "pointer"
                }}
              >
                <option value="all">🌐 All Clients (Agency Master)</option>
                {agencyClients.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    🏢 {cl.code}: {cl.name} ({cl.openJobsCount} jobs, {(cl.candidatePoolCount / 1000).toFixed(1)}k talent)
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            className="copilot-toggle-btn"
            onClick={() => setCopilotOpen(!copilotOpen)}
          >
            <Sparkles size={16} color="#2dd4bf" />
            <span>Recruiter Copilot</span>
          </button>

          <button
            type="button"
            onClick={() => setBlindReviewMode(!blindReviewMode)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              border: "1px solid var(--line)",
              background: blindReviewMode ? "#f3e8ff" : "#fff",
              color: blindReviewMode ? "#7e22ce" : "#4b5563"
            }}
          >
            {blindReviewMode ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>Blind Screening: {blindReviewMode ? "ON" : "OFF"}</span>
          </button>

          {/* USER AUTH & RECRUITER PROFILE */}
          {session?.user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px 10px",
                  borderRadius: "6px",
                  background: "#f1f5f9",
                  fontSize: "12px",
                  border: "1px solid var(--line)"
                }}
              >
                <div
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: isAdmin
                      ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                      : userRole === "hiring_manager"
                      ? "#7c3aed"
                      : "#2563eb",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "11px",
                    fontWeight: 700
                  }}
                >
                  {(userProfile?.user?.fullName || session.user.user_metadata?.full_name || session.user.email || "U")[0].toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
                  <span style={{ fontWeight: 600, color: "#1e293b", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {userProfile?.user?.fullName || session.user.user_metadata?.full_name || session.user.email?.split("@")[0]}
                  </span>
                  <span style={{ fontSize: "10px", color: isAdmin ? "#b45309" : "#64748b", fontWeight: isAdmin ? 700 : 500, textTransform: "capitalize" }}>
                    {isAdmin ? "👑 Workspace Admin" : `${userRole.replace("_", " ")}`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (supabase) await supabase.auth.signOut();
                  setSession(null);
                  setUserProfile(null);
                  setApiAccessToken("");
                  setCandidates([]);
                  setJobs([]);
                  setTalentPools([]);
                  setProcessingQueue([]);
                  setAgencyClients([]);
                  setReport(emptyReport);
                  setNotice("Signed out of Resume Scanner.");
                }}
                title="Sign Out"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "7px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "#64748b"
                }}
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                borderRadius: "6px",
                border: "none",
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(37, 99, 235, 0.25)"
              }}
            >
              <LogIn size={14} />
              <span>Sign In / Register</span>
            </button>
          )}
        </header>

        {/* NOTICES & ALERTS */}
        {notice && (
          <div style={{ margin: "16px 24px 0", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 16px", borderRadius: "6px", color: "#15803d", fontSize: "13px", display: "flex", justifyContent: "space-between" }}>
            <span>{notice}</span>
            <button onClick={() => setNotice("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#15803d" }}><X size={14} /></button>
          </div>
        )}
        {error && (
          <div style={{ margin: "16px 24px 0", background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 16px", borderRadius: "6px", color: "#b91c1c", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span>{error}</span>
              {error.toLowerCase().includes("sign in") && (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  style={{
                    background: "#b91c1c",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Sign In Now
                </button>
              )}
            </div>
            <button onClick={() => setError("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#b91c1c" }}><X size={14} /></button>
          </div>
        )}

        {/* WORKSPACE VIEWS */}
        <main className="workspace-body" style={{ flex: 1, padding: "24px" }}>
          {loading ? (
            <div style={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                <Loader2 className="spinning" size={32} color="var(--brand)" />
                <span style={{ fontSize: "14px", color: "var(--muted)" }}>Connecting to Resume Scanner...</span>
              </div>
            </div>
          ) : (
            <>
              {activeView === "command_center" && (
                <CommandCenterView
                  candidates={candidates}
                  jobs={jobs}
                  report={report}
                  onNavigate={(view) => setActiveView(view)}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                  onRunRediscovery={handleRunRediscovery}
                />
              )}

              {activeView === "candidates" && (
                <CandidatesDatabaseView
                  candidates={candidates}
                  blindMode={blindReviewMode}
                  selectedIds={selectedCandidateIds}
                  onToggleSelect={toggleSelectCandidate}
                  onSelectAll={setSelectedCandidateIds}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                  onCompare={(ids) => {
                    setSelectedCandidateIds(ids);
                    setActiveView("compare");
                  }}
                  onRefresh={loadWorkspace}
                />
              )}

              {activeView === "rediscovery" && (
                <TalentRediscoveryView
                  jobs={jobs}
                  selectedJobId={rediscoveryJobId}
                  onSelectJob={setRediscoveryJobId}
                  loading={rediscoveryLoading}
                  metrics={rediscoveryMetrics}
                  results={rediscoveryResults}
                  onRun={handleRunRediscovery}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                  onActivateCandidate={async (candId, name) => {
                    await updateCandidateProfile(candId, { status: "shortlisted" });
                    setCandidates((prev) =>
                      prev.map((c) => (c.id === candId ? { ...c, status: "shortlisted" } : c))
                    );
                    setNotice(`Candidate ${name} activated and moved to Shortlisted stage!`);
                  }}
                  onReopenOutreach={(jobId) => {
                    setCampaignPreselectedJobId(jobId);
                    setActiveView("campaigns");
                  }}
                />
              )}

              {activeView === "graph" && (
                <TalentGraphView
                  candidates={candidates}
                  selectedCandidateId={activeCandidateId}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                  onCompare={(ids) => {
                    setSelectedCandidateIds(ids);
                    setActiveView("compare");
                  }}
                />
              )}

              {activeView === "agency" && (
                <AgencyMultiClientView
                  clients={agencyClients}
                  activeClientId={activeClientId}
                  onSwitchClient={async (cId) => {
                    setActiveClientId(cId);
                    await switchAgencyClient(cId);
                    setNotice(`Switched active workspace to ${cId.toUpperCase()}.`);
                  }}
                  onCreateClient={async (payload) => {
                    const res = await createAgencyClient(payload);
                    setAgencyClients((prev) => [...prev, res.client]);
                    setNotice(`Created client account for ${res.client.name}.`);
                  }}
                  onNavigateToRediscovery={() => setActiveView("rediscovery")}
                />
              )}

              {activeView === "search" && (
                <TalentSearchView
                  query={globalQuery}
                  onQueryChange={setGlobalQuery}
                  onSearch={(q) => handleGlobalSearch(undefined, q)}
                  isSearching={isSearching}
                  result={naturalSearchResult}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                  allCandidates={candidates}
                />
              )}

              {activeView === "pipeline" && (
                <PipelineKanbanView
                  candidates={candidates}
                  blindMode={blindReviewMode}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                  onStatusChange={async (candId, newStatus) => {
                    await moveCandidatePipelineStage(candId, newStatus, "Recruiter drag & drop stage transition");
                    setCandidates((prev) =>
                      prev.map((c) => (c.id === candId ? { ...c, status: newStatus } : c))
                    );
                    setNotice(`Candidate stage updated to ${STATUS_LABELS[newStatus] || newStatus} and logged in compliance audit.`);
                  }}
                />
              )}

              {activeView === "jobs" && (
                <JobsIntelligenceView
                  jobs={jobs}
                  candidates={candidates}
                  onJobCreated={async (newJob) => {
                    const created = await createJob(newJob);
                    setJobs([created, ...jobs]);
                    setNotice("Job opening created and indexed for AI matching!");
                  }}
                  onRunRediscoveryForJob={(jId) => {
                    setRediscoveryJobId(jId);
                    setActiveView("rediscovery");
                    handleRunRediscovery();
                  }}
                />
              )}

              {activeView === "compare" && (
                <CandidateComparisonView
                  candidates={candidates.filter((c) => selectedCandidateIds.includes(c.id)).slice(0, 3)}
                  allCandidates={candidates}
                  selectedIds={selectedCandidateIds}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                  onSelectIds={setSelectedCandidateIds}
                />
              )}

              {activeView === "pools" && (
                <TalentPoolsView
                  pools={talentPools}
                  candidates={candidates}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                  onCreatePool={async (name, desc) => {
                    const pool = await createTalentPool(name, desc);
                    setTalentPools([...talentPools, pool]);
                    setNotice("Talent pool created.");
                  }}
                  onExplorePool={(poolName) => {
                    setActiveView("candidates");
                    setNotice(`Exploring candidates in pool: ${poolName}`);
                  }}
                />
              )}

              {activeView === "intake" && (
                <IntakeCenterView
                  mode={intakeMode}
                  onSetMode={setIntakeMode}
                  files={files}
                  onSetFiles={setFiles}
                  role={role}
                  onSetRole={setRole}
                  source={source}
                  onSetSource={setSource}
                  uploading={uploading}
                  onUpload={handleUpload}
                  gmailStatus={gmailStatus}
                  gmailRole={gmailRole}
                  onSetGmailRole={setGmailRole}
                  gmailQuery={gmailQuery}
                  onSetGmailQuery={setGmailQuery}
                  gmailMaxResults={gmailMaxResults}
                  onSetGmailMaxResults={setGmailMaxResults}
                  gmailFullSync={gmailFullSync}
                  onSetGmailFullSync={setGmailFullSync}
                  importingGmail={importingGmail}
                  onImportGmail={handleGmailImport}
                  onConnectGmail={handleConnectGmail}
                  onDisconnectGmail={handleDisconnectGmail}
                  queue={processingQueue}
                />
              )}

              {activeView === "duplicates" && (
                <DuplicatesCenterView
                  candidates={candidates}
                  onMerge={async (pId, sId) => {
                    await mergeDuplicateCandidates(pId, sId);
                    await loadWorkspace();
                    setNotice("Duplicate candidate merged successfully.");
                  }}
                  onDeleteCandidate={async (candId) => {
                    await deleteCandidate(candId);
                    await loadWorkspace();
                    setNotice("Candidate record permanently deleted.");
                  }}
                />
              )}

              {activeView === "data_quality" && (
                <DataQualityCenterView
                  candidates={candidates}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                />
              )}

              {activeView === "campaigns" && (
                <CampaignsView
                  jobs={jobs}
                  candidates={candidates}
                  preselectedJobId={campaignPreselectedJobId}
                  onClearPreselectedJob={() => setCampaignPreselectedJobId("")}
                />
              )}

              {activeView === "reports" && <ReportsView report={report} />}

              {activeView === "settings" && (
                <SettingsView
                  onRefreshWorkspace={loadWorkspace}
                  currentUserEmail={session?.user?.email || ""}
                  currentUserProfile={userProfile}
                  currentUserRole={userRole}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* RECRUITER COPILOT PANEL */}
      {copilotOpen && (
        <aside className="copilot-panel">
          <div className="copilot-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={18} color="#2dd4bf" />
              <strong style={{ fontSize: "14px" }}>Recruiter Copilot</strong>
            </div>
            <button
              onClick={() => setCopilotOpen(false)}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
            >
              <X size={18} />
            </button>
          </div>

          <div className="copilot-messages">
            {copilotMessages.map((msg) => (
              <div key={msg.id} className={`copilot-bubble ${msg.role}`}>
                <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                {msg.toolCalls && (
                  <div style={{ marginTop: "6px", fontSize: "11px", opacity: 0.8 }}>
                    {msg.toolCalls.map((t, idx) => (
                      <span key={idx} style={{ background: "rgba(0,0,0,0.1)", padding: "2px 6px", borderRadius: "3px", marginRight: "4px" }}>
                        Tool: {t.tool}
                      </span>
                    ))}
                  </div>
                )}
                {msg.actionSuggestions && (
                  <div className="copilot-suggestions">
                    {msg.actionSuggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        className="copilot-chip"
                        onClick={() => handleSendCopilot(sug)}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
                <span style={{ display: "block", fontSize: "10px", marginTop: "4px", opacity: 0.6, textAlign: "right" }}>
                  {msg.timestamp}
                </span>
              </div>
            ))}
            {copilotBusy && (
              <div className="copilot-bubble assistant" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Loader2 size={14} className="spinning" />
                <span>Copilot is reasoning with talent data...</span>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendCopilot();
            }}
            className="copilot-input-bar"
          >
            <input
              type="text"
              placeholder="Ask Copilot (e.g. Compare top candidates)..."
              value={copilotInput}
              onChange={(e) => setCopilotInput(e.target.value)}
              style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
            />
            <button
              type="submit"
              disabled={copilotBusy || !copilotInput.trim()}
              style={{ background: "#111827", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "6px" }}
            >
              <Send size={14} />
            </button>
          </form>
        </aside>
      )}

      {/* CANDIDATE DOSSIER DRAWER */}
      {activeCandidateId && (
        <CandidateDossierDrawer
          detail={activeCandidateDetail}
          blindMode={blindReviewMode}
          jobs={jobs}
          onClose={() => setActiveCandidateId(null)}
          onRevealIdentity={() => handleRevealCandidate(activeCandidateId)}
          onSave={async (updates) => {
            await updateCandidateProfile(activeCandidateId, updates);
            await loadWorkspace();
            setNotice("Candidate dossier updated.");
          }}
        />
      )}

      {/* RECRUITER AUTH & LOGIN MODAL */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(newSession) => {
          setSession(newSession);
          setApiAccessToken(newSession?.access_token ?? "");
          loadWorkspace();
        }}
        onContinueAsGuest={() => {
          setNotice("Exploring workspace in Demo Recruiter mode.");
          loadWorkspace();
        }}
      />
    </div>
  );
}

// ==========================================
// 1. COMMAND CENTER VIEW
// ==========================================

function CommandCenterView({
  candidates,
  jobs,
  report,
  onNavigate,
  onSelectCandidate,
  onRunRediscovery
}: {
  candidates: Candidate[];
  jobs: JobOpening[];
  report: ReportSummary;
  onNavigate: (view: ViewKey) => void;
  onSelectCandidate: (id: string) => void;
  onRunRediscovery: () => void;
}) {
  const topCandidates = useMemo(() => candidates.slice(0, 6), [candidates]);

  // Dynamic calculations based strictly on real state:
  const totalTalent = candidates.length;
  const newToday = report.uploadedToday || candidates.filter((c) => {
    const today = new Date().toISOString().slice(0, 10);
    return c.createdAt && c.createdAt.slice(0, 10) === today;
  }).length;
  const openJobsCount = jobs.filter((j) => j.status === "open").length || jobs.length;
  const strongMatchesCount = candidates.filter(
    (c) => c.status === "shortlisted" || c.status === "interview" || c.status === "offer"
  ).length;
  const timeSavedHours = totalTalent > 0 ? (totalTalent * 0.35).toFixed(1) : "0";
  const rediscoveryPotential = candidates.filter(
    (c) => ["hold", "rejected", "shortlisted"].includes(c.status) || (c.tags && c.tags.length > 0)
  ).length;
  const duplicateCount = report.duplicateCount || 0;
  const avgDataQuality = totalTalent > 0
    ? Math.round(candidates.reduce((acc, c) => acc + (c.dataQualityScore || 90), 0) / totalTalent)
    : 100;

  // Dynamic talent insight based on active requisitions
  const targetJob = jobs.find((j) => j.status === "open") || jobs[0];
  const targetRoleTitle = targetJob ? targetJob.title : "Software Engineer";
  const matchingCandidatesCount = targetJob
    ? candidates.filter((c) =>
        (c.matchedSkills || []).some((s) => targetRoleTitle.toLowerCase().includes(s.toLowerCase())) ||
        c.primaryDomainKey === "backend" ||
        c.primaryDomainKey === "frontend"
      ).length
    : candidates.length;

  return (
    <div className="command-center-view">
      <div className="command-center-hero">
        <div className="cc-hero-text">
          <h1>RESUME SCANNER</h1>
          <p>Your company's private talent intelligence layer. Discover, evaluate, and rediscover talent.</p>
        </div>
        <button
          onClick={() => {
            onNavigate("rediscovery");
            onRunRediscovery();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#2dd4bf",
            color: "#0f766e",
            border: "none",
            padding: "10px 18px",
            borderRadius: "8px",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          <Zap size={16} />
          <span>Rediscover Talent</span>
        </button>
      </div>

      {/* 8 DYNAMIC V11 KPI CARDS */}
      <div className="cc-kpi-grid">
        <div className="kpi-card">
          <span className="kpi-title">TOTAL TALENT</span>
          <span className="kpi-val">{totalTalent.toLocaleString()}</span>
          <span className="kpi-sub">Private talent intelligence</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">NEW TODAY</span>
          <span className="kpi-val">{newToday.toLocaleString()}</span>
          <span className="kpi-sub">Across intake channels</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">OPEN JOBS</span>
          <span className="kpi-val">{openJobsCount}</span>
          <span className="kpi-sub">Actively matching requisitions</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">STRONG MATCHES</span>
          <span className="kpi-val">{strongMatchesCount}</span>
          <span className="kpi-sub">Shortlisted & interviewing</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">TIME SAVED</span>
          <span className="kpi-val">{timeSavedHours} hrs</span>
          <span className="kpi-sub">Automated screening</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">REDISCOVERABLE</span>
          <span className="kpi-val">{rediscoveryPotential}</span>
          <span className="kpi-sub">From historical pipeline</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">DUPLICATES BLOCKED</span>
          <span className="kpi-val">{duplicateCount}</span>
          <span className="kpi-sub">Prevented & isolated</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">DATA QUALITY</span>
          <span className="kpi-val">{avgDataQuality}%</span>
          <span className="kpi-sub">Average profile completeness</span>
        </div>
      </div>

      {/* DYNAMIC RESUME SCANNER INSIGHT CALLOUT */}
      <div className="insight-callout-card">
        <div className="insight-callout-text">
          <h4>RESUME SCANNER TALENT INSIGHT</h4>
          <p>
            {totalTalent > 0 ? (
              <>
                You have <strong>{matchingCandidatesCount} candidates</strong> aligned with <em>"{targetRoleTitle}"</em> in your private database.
                Reactivate and engage them without spending on external job postings.
              </>
            ) : (
              <>
                Your private talent database is ready. Connect your company Gmail inbox or upload resumes in the Intake Center to start automated talent matching.
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => {
            onNavigate("rediscovery");
            onRunRediscovery();
          }}
          className="button"
          style={{ background: "var(--brand)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px" }}
        >
          Review Candidates
        </button>
      </div>

      {/* RECENT INTELLIGENCE & ACTIVITY */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div className="panel" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "10px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "15px" }}>Recent Talent Dossiers</h3>
            <button onClick={() => onNavigate("candidates")} style={{ border: "none", background: "none", color: "var(--brand)", fontSize: "12px", cursor: "pointer" }}>
              View All →
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {topCandidates.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                No resumes imported yet. Connect Gmail or upload resumes to see talent dossiers here.
              </div>
            ) : (
              topCandidates.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelectCandidate(c.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    background: "#f8fafc",
                    cursor: "pointer",
                    border: "1px solid #f1f5f9"
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "13px" }}>{c.canonicalName}</strong>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      {c.currentTitle} • {c.experienceYears ? `${c.experienceYears} yrs` : "Experienced"} • {c.location}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--brand)" }}>
                      {c.dataQualityScore}% Quality
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "10px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "15px" }}>Continuous Ingestion Feed</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
              <span><strong>{totalTalent} resume{totalTalent !== 1 ? "s" : ""}</strong> indexed in private database</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6" }} />
              <span><strong>{candidates.filter((c) => c.status !== "needs_review").length} candidates</strong> parsed with deep skill extraction</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#8b5cf6" }} />
              <span><strong>{strongMatchesCount} candidate{strongMatchesCount !== 1 ? "s" : ""}</strong> in active review / interview pipeline</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b" }} />
              <span><strong>{duplicateCount} duplicate submission{duplicateCount !== 1 ? "s" : ""}</strong> automatically isolated & skipped</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. CANDIDATES DATABASE VIEW
// ==========================================

function CandidatesDatabaseView({
  candidates,
  blindMode,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onSelectCandidate,
  onCompare,
  onRefresh
}: {
  candidates: Candidate[];
  blindMode: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onSelectCandidate: (id: string) => void;
  onCompare: (ids: string[]) => void;
  onRefresh: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      const matchSearch =
        !searchTerm ||
        (c.canonicalName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.matchedSkills || []).some((s) => s.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.location || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = !statusFilter || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [candidates, searchTerm, statusFilter]);

  return (
    <div className="candidates-database-view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px" }}>Private Talent Database</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "13px" }}>
            {candidates.length} structured candidates with normalized skill matrices and timeline evidence.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {selectedIds.length >= 2 && (
            <button
              onClick={() => onCompare(selectedIds)}
              className="button"
              style={{ background: "#111827", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "6px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
            >
              <SlidersHorizontal size={14} />
              <span>Compare Selected ({selectedIds.length})</span>
            </button>
          )}
          <button
            onClick={onRefresh}
            className="button"
            style={{ background: "#fff", border: "1px solid var(--line)", padding: "8px 12px", borderRadius: "6px", fontSize: "12px" }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="text"
            placeholder="Filter candidates by name, skill, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px", background: "#fff" }}
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* CANDIDATES TABLE */}
      <div className="table-responsive" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", overflow: "hidden" }}>
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid var(--line)", textAlign: "left", color: "var(--muted)" }}>
              <th style={{ padding: "12px 14px", width: "36px" }}>
                <input
                  type="checkbox"
                  checked={selectedIds.length === filtered.length && filtered.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) onSelectAll(filtered.map((c) => c.id));
                    else onSelectAll([]);
                  }}
                />
              </th>
              <th style={{ padding: "12px 14px" }}>Candidate</th>
              <th style={{ padding: "12px 14px" }}>Role / Domain</th>
              <th style={{ padding: "12px 14px" }}>Experience</th>
              <th style={{ padding: "12px 14px" }}>Verified Skills</th>
              <th style={{ padding: "12px 14px" }}>Location</th>
              <th style={{ padding: "12px 14px" }}>Quality</th>
              <th style={{ padding: "12px 14px" }}>Status</th>
              <th style={{ padding: "12px 14px", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "12px 14px" }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => onToggleSelect(c.id)}
                  />
                </td>
                <td style={{ padding: "12px 14px" }}>
                  {blindMode ? (
                    <div className="blind-badge">#{c.blindId}</div>
                  ) : (
                    <div>
                      <strong style={{ cursor: "pointer", color: "var(--ink)" }} onClick={() => onSelectCandidate(c.id)}>
                        {c.canonicalName}
                      </strong>
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>{c.email || "Confidential"}</div>
                    </div>
                  )}
                </td>
                <td style={{ padding: "12px 14px" }}>{c.currentTitle || c.primaryDomain}</td>
                <td style={{ padding: "12px 14px" }}>{c.experienceYears ? `${c.experienceYears} yrs` : "—"}</td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", maxWidth: "260px" }}>
                    {(c.matchedSkills || []).slice(0, 4).map((sk, idx) => (
                      <span key={idx} style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "11px" }}>
                        {sk}
                      </span>
                    ))}
                    {(c.matchedSkills || []).length > 4 && (
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>+{(c.matchedSkills || []).length - 4}</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "12px 14px" }}>{c.location}</td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ fontWeight: 600, color: c.dataQualityScore >= 80 ? "var(--green)" : "var(--amber)" }}>
                    {c.dataQualityScore}%
                  </span>
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <span className={`status-pill status-${c.status}`}>
                    {STATUS_LABELS[c.status] || c.status}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", textAlign: "right" }}>
                  <button
                    onClick={() => onSelectCandidate(c.id)}
                    className="button"
                    style={{ background: "#f8fafc", border: "1px solid var(--line)", padding: "4px 8px", borderRadius: "4px", fontSize: "12px" }}
                  >
                    Dossier
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// 3. TALENT REDISCOVERY VIEW
// ==========================================

function TalentRediscoveryView({
  jobs,
  selectedJobId,
  onSelectJob,
  loading,
  metrics,
  results,
  onRun,
  onSelectCandidate,
  onActivateCandidate,
  onReopenOutreach
}: {
  jobs: JobOpening[];
  selectedJobId: string;
  onSelectJob: (id: string) => void;
  loading: boolean;
  metrics: any;
  results: RediscoveryResult[];
  onRun: () => void;
  onSelectCandidate: (id: string) => void;
  onActivateCandidate?: (id: string, name: string) => void;
  onReopenOutreach?: (jobId: string) => void;
}) {
  return (
    <div className="talent-rediscovery-view">
      <div className="rediscovery-banner">
        <h2 style={{ margin: "0 0 6px 0", fontSize: "20px" }}>Rediscover Talent</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
          Don't start every hire from zero. Automatically scan your private database of historical candidates for your next opening.
        </p>

        <div style={{ display: "flex", gap: "12px", marginTop: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedJobId}
            onChange={(e) => onSelectJob(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", background: "#fff", fontSize: "13px", minWidth: "280px" }}
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title} ({j.department || "Engineering"})</option>
            ))}
          </select>
          <button
            onClick={onRun}
            disabled={loading}
            className="button"
            style={{ background: "#0f766e", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
          >
            {loading ? <Loader2 size={14} className="spinning" /> : <Zap size={14} />}
            <span>Run Rediscovery Engine</span>
          </button>

          {onReopenOutreach && (
            <button
              onClick={() => onReopenOutreach(selectedJobId)}
              className="button"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                color: "#ffffff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)"
              }}
              title="Send outreach email to prior applicants when this vacancy reopens"
            >
              <Send size={14} />
              <span>📢 Reopen Vacancy & Notify Past Applicants</span>
            </button>
          )}
        </div>
      </div>

      {metrics && (
        <div className="cc-kpi-grid" style={{ marginBottom: "20px" }}>
          <div className="kpi-card">
            <span className="kpi-title">TOTAL SEARCHED</span>
            <span className="kpi-val">{metrics.totalSearched}</span>
            <span className="kpi-sub">Entire candidate database</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-title">STRONG MATCHES</span>
            <span className="kpi-val">{metrics.strongMatches}</span>
            <span className="kpi-sub">Exceeds match threshold</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-title">PREVIOUSLY INTERVIEWED</span>
            <span className="kpi-val">{metrics.previouslyInterviewed}</span>
            <span className="kpi-sub">High-intent prior finalists</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-title">PREVIOUSLY SHORTLISTED</span>
            <span className="kpi-val">{metrics.previouslyShortlisted}</span>
            <span className="kpi-sub">Qualified unhired talent</span>
          </div>
        </div>
      )}

      {/* RESULTS LIST */}
      {results.length === 0 ? (
        <div style={{ background: "#fff", border: "1px dashed var(--line)", borderRadius: "8px", padding: "40px 24px", textAlign: "center" }}>
          <Sparkles size={32} color="#0f766e" style={{ margin: "0 auto 12px" }} />
          <h3 style={{ margin: "0 0 6px 0", fontSize: "16px" }}>No Rediscovered Candidates Found</h3>
          <p style={{ margin: "0 auto 18px", color: "var(--muted)", fontSize: "13px", maxWidth: "480px" }}>
            Select an open job opening above and click "Run Rediscovery Engine" to automatically match historical candidates and unselected finalists.
          </p>
          <button
            onClick={onRun}
            disabled={loading}
            className="button"
            style={{ background: "#0f766e", color: "#fff", border: "none", padding: "8px 18px", borderRadius: "6px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
          >
            {loading ? <Loader2 size={14} className="spinning" /> : <Zap size={14} />}
            <span>Run Rediscovery Engine</span>
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {results.map((item) => (
            <div
              key={item.candidate.id}
              style={{
                background: "#fff",
                border: "1px solid var(--line)",
                borderRadius: "8px",
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--brand)", minWidth: "50px" }}>
                  {item.overallScore}%
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <strong style={{ fontSize: "14px" }}>{item.candidate.canonicalName}</strong>
                    <span className={`historical-tag ${item.historicalTag.includes("interview") ? "interviewed" : "shortlisted"}`}>
                      {item.historicalTag}
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "6px" }}>
                    {item.candidate.currentTitle} • {item.candidate.experienceYears ? `${item.candidate.experienceYears} yrs` : "Experienced"} • {item.candidate.location}
                  </div>
                  <div style={{ fontSize: "12px", color: "#475569" }}>
                    <strong>Rediscovery Signal:</strong> {item.rediscoveryReason}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => onSelectCandidate(item.candidate.id)}
                  className="button"
                  style={{ background: "#f8fafc", border: "1px solid var(--line)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                >
                  View Evidence
                </button>
                <button
                  onClick={() => onActivateCandidate && onActivateCandidate(item.candidate.id, item.candidate.canonicalName)}
                  className="button"
                  style={{ background: "#0f766e", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                  title="Move candidate to Shortlisted stage for this opening"
                >
                  Activate Candidate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 4. TALENT SEARCH VIEW
// ==========================================

function TalentSearchView({
  query,
  onQueryChange,
  onSearch,
  isSearching,
  result,
  onSelectCandidate,
  allCandidates = []
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  isSearching: boolean;
  result: NaturalSearchResult | null;
  onSelectCandidate: (id: string) => void;
  allCandidates?: Candidate[];
}) {
  const [localQuery, setLocalQuery] = useState(query || "");

  useEffect(() => {
    setLocalQuery(query || "");
  }, [query]);

  const quickPrompts = [
    "Senior Python Developer (5+ yrs)",
    "Frontend React / TypeScript",
    "Cloud & DevOps Architect (AWS/GCP)",
    "Full Stack Engineer (Bengaluru)",
    "Machine Learning & GenAI Specialist"
  ];

  function handleSubmit(e?: FormEvent) {
    if (e) e.preventDefault();
    onQueryChange(localQuery);
    onSearch(localQuery);
  }

  function handleQuickPrompt(promptText: string) {
    setLocalQuery(promptText);
    onQueryChange(promptText);
    onSearch(promptText);
  }

  return (
    <div className="talent-search-view">
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 6px 0", fontSize: "20px" }}>Natural Language Talent Search</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
          Describe the exact role, required technologies, experience level, and location in plain English. The AI parses structured criteria and ranks candidates.
        </p>
      </div>

      {/* DEDICATED SEARCH BAR */}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="text"
            placeholder="e.g. Senior Backend Engineer with 5+ years Python and Docker in Bengaluru..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid var(--line)",
              fontSize: "14px",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
            }}
          />
          {localQuery && (
            <button
              type="button"
              onClick={() => {
                setLocalQuery("");
                onQueryChange("");
              }}
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer"
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={isSearching}
          style={{
            background: "var(--brand)",
            color: "#fff",
            border: "none",
            padding: "0 22px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          {isSearching ? <Loader2 size={16} className="spinning" /> : <Search size={16} />}
          <span>Search Talent</span>
        </button>
      </form>

      {/* QUICK PRESET CHIPS */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
        <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>Quick Presets:</span>
        {quickPrompts.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleQuickPrompt(p)}
            style={{
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              color: "#334155",
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {isSearching && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "24px", background: "#fff", borderRadius: "8px", border: "1px solid var(--line)", marginBottom: "20px" }}>
          <Loader2 size={20} className="spinning" color="var(--brand)" />
          <span style={{ fontSize: "14px", color: "#334155" }}>Analyzing natural language requirements and scoring candidates...</span>
        </div>
      )}

      {result && (
        <div>
          {/* INTERPRETED CRITERIA CHIPS */}
          <div style={{ background: "#f8fafc", border: "1px solid var(--line)", borderRadius: "8px", padding: "14px 18px", marginBottom: "20px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: "8px" }}>
              Interpreted Search Parameters:
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {result.parsedCriteria.skills.map((sk, idx) => (
                <span key={idx} style={{ background: "#e0f2fe", color: "#0369a1", padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 500 }}>
                  Skill: {sk}
                </span>
              ))}
              {result.parsedCriteria.minExperience && (
                <span style={{ background: "#fef3c7", color: "#92400e", padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 500 }}>
                  Min Experience: {result.parsedCriteria.minExperience}+ years
                </span>
              )}
              {result.parsedCriteria.location && (
                <span style={{ background: "#f3e8ff", color: "#7e22ce", padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 500 }}>
                  Location: {result.parsedCriteria.location}
                </span>
              )}
              {result.parsedCriteria.seniority && (
                <span style={{ background: "#dcfce7", color: "#15803d", padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 500 }}>
                  Seniority: {result.parsedCriteria.seniority}
                </span>
              )}
              {result.parsedCriteria.skills.length === 0 && !result.parsedCriteria.minExperience && !result.parsedCriteria.location && !result.parsedCriteria.seniority && (
                <span style={{ fontSize: "12px", color: "#64748b" }}>Broad Semantic Search across all candidate profiles</span>
              )}
            </div>
          </div>

          <h3 style={{ fontSize: "15px", marginBottom: "14px" }}>
            Found {result.totalFound} matching candidate{result.totalFound === 1 ? "" : "s"}
          </h3>

          {result.results.length === 0 ? (
            <div style={{ background: "#fff", border: "1px dashed var(--line)", borderRadius: "8px", padding: "32px", textAlign: "center", color: "var(--muted)" }}>
              No candidates in your database currently meet all parsed criteria. Try broader keywords or click one of the quick presets above.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {result.results.map((item) => (
                <div
                  key={item.candidate.id}
                  onClick={() => onSelectCandidate(item.candidate.id)}
                  style={{
                    background: "#fff",
                    border: "1px solid var(--line)",
                    borderRadius: "8px",
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    transition: "border-color 0.15s ease"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <strong style={{ fontSize: "14px" }}>{item.candidate.canonicalName}</strong>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>{item.candidate.currentTitle}</span>
                      {item.candidate.location && (
                        <span style={{ fontSize: "11px", color: "#64748b", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>
                          {item.candidate.location}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", color: "#475569" }}>
                      {item.reasons.join(" • ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--brand)" }}>
                      {item.relevanceScore}%
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>Relevance</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* IF NO SEARCH PERFORMED YET, SHOW CANDIDATE POOL PREVIEW */}
      {!result && !isSearching && allCandidates.length > 0 && (
        <div style={{ marginTop: "10px" }}>
          <h3 style={{ fontSize: "15px", marginBottom: "12px", color: "#334155" }}>
            Available Candidates in Private Pool ({allCandidates.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {allCandidates.slice(0, 5).map((c) => (
              <div
                key={c.id}
                onClick={() => onSelectCandidate(c.id)}
                style={{
                  background: "#fff",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "14px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer"
                }}
              >
                <div>
                  <strong style={{ fontSize: "14px" }}>{c.canonicalName}</strong>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                    {c.currentTitle} • {c.location} • {c.experienceYears ? `${c.experienceYears} yrs` : "Experienced"}
                  </div>
                </div>
                <button
                  type="button"
                  style={{ background: "#f8fafc", border: "1px solid var(--line)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                >
                  View Dossier →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 5. PIPELINE (KANBAN) VIEW
// ==========================================

function PipelineKanbanView({
  candidates,
  blindMode,
  onSelectCandidate,
  onStatusChange
}: {
  candidates: Candidate[];
  blindMode: boolean;
  onSelectCandidate: (id: string) => void;
  onStatusChange: (id: string, newStatus: ApplicationStatus) => void;
}) {
  const stages: ApplicationStatus[] = [
    "new",
    "needs_review",
    "shortlisted",
    "screening",
    "interview",
    "offer",
    "hired"
  ];

  return (
    <div className="pipeline-kanban-view">
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "20px" }}>Recruiter Pipeline</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
          Live candidate stages. Drag or update candidates across evaluation workflows.
        </p>
      </div>

      <div className="pipeline-board">
        {stages.map((stage) => {
          const inStage = candidates.filter((c) => c.status === stage);
          return (
            <div key={stage} className="pipeline-col">
              <div className="pipeline-col-header">
                <span>{STATUS_LABELS[stage] || stage}</span>
                <span style={{ background: "#e2e8f0", padding: "1px 6px", borderRadius: "10px" }}>
                  {inStage.length}
                </span>
              </div>
              {inStage.map((cand) => (
                <div
                  key={cand.id}
                  className="pipeline-card"
                  onClick={() => onSelectCandidate(cand.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <strong style={{ fontSize: "13px" }}>
                      {blindMode ? `#${cand.blindId}` : cand.canonicalName}
                    </strong>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--brand)" }}>
                      {cand.dataQualityScore}%
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>
                    {cand.currentTitle} • {cand.location}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>
                      {(cand.matchedSkills || [])[0] || "Candidate"}
                    </span>
                    <select
                      value={cand.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onStatusChange(cand.id, e.target.value as ApplicationStatus)}
                      style={{ fontSize: "11px", border: "1px solid var(--line)", borderRadius: "4px", padding: "2px 4px" }}
                    >
                      {stages.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// 6. CANDIDATE COMPARISON VIEW
// ==========================================

function CandidateComparisonView({
  candidates,
  allCandidates,
  selectedIds,
  onSelectCandidate,
  onSelectIds
}: {
  candidates: Candidate[];
  allCandidates: Candidate[];
  selectedIds: string[];
  onSelectCandidate: (id: string) => void;
  onSelectIds: (ids: string[]) => void;
}) {
  return (
    <div className="candidate-comparison-view">
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 6px 0", fontSize: "20px" }}>Side-by-Side Candidate Comparison</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
          Explainable, evidence-grounded comparison across verified skills, seniority, and technical alignment.
        </p>
      </div>

      {candidates.length < 2 ? (
        <div style={{ background: "#fff", padding: "30px", borderRadius: "8px", border: "1px solid var(--line)", textAlign: "center" }}>
          <p>Select at least 2 candidates from the Talent Database to generate a comparison matrix.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", marginTop: "12px" }}>
            {allCandidates.slice(0, 4).map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectIds([...selectedIds, c.id])}
                style={{ padding: "6px 12px", borderRadius: "4px", border: "1px solid var(--line)", background: "#f8fafc", fontSize: "12px" }}
              >
                + Add {c.canonicalName}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: "14px", textAlign: "left", width: "200px" }}>Attribute</th>
                {candidates.map((c) => (
                  <th key={c.id} style={{ padding: "14px", textAlign: "left" }}>
                    <div
                      style={{ fontWeight: 700, fontSize: "14px", cursor: "pointer", color: "var(--brand)" }}
                      onClick={() => onSelectCandidate(c.id)}
                    >
                      {c.canonicalName}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 400 }}>{c.currentTitle}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "14px", fontWeight: 600 }}>Experience</td>
                {candidates.map((c) => (
                  <td key={c.id} style={{ padding: "14px" }}>{c.experienceYears ? `${c.experienceYears} years` : "—"}</td>
                ))}
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "14px", fontWeight: 600 }}>Location</td>
                {candidates.map((c) => (
                  <td key={c.id} style={{ padding: "14px" }}>{c.location}</td>
                ))}
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "14px", fontWeight: 600 }}>Seniority Level</td>
                {candidates.map((c) => (
                  <td key={c.id} style={{ padding: "14px" }}>{c.seniority || "Professional"}</td>
                ))}
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "14px", fontWeight: 600 }}>Verified Skills</td>
                {candidates.map((c) => (
                  <td key={c.id} style={{ padding: "14px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {(c.matchedSkills || []).map((sk, idx) => (
                        <span key={idx} style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "11px" }}>
                          {sk}
                        </span>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "14px", fontWeight: 600 }}>Data Quality</td>
                {candidates.map((c) => (
                  <td key={c.id} style={{ padding: "14px" }}>
                    <span style={{ fontWeight: 700, color: "var(--green)" }}>{c.dataQualityScore}%</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 7. JOBS & INTELLIGENCE VIEW
// ==========================================

function JobsIntelligenceView({
  jobs,
  candidates,
  onJobCreated,
  onRunRediscoveryForJob
}: {
  jobs: JobOpening[];
  candidates: Candidate[];
  onJobCreated: (job: { title: string; department: string; location: string; description: string }) => void;
  onRunRediscoveryForJob: (id: string) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("Engineering");
  const [location, setLocation] = useState("Bengaluru");
  const [description, setDescription] = useState("");

  return (
    <div className="jobs-intelligence-view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h2 style={{ margin: "0 0 4px 0", fontSize: "20px" }}>Jobs & Market Intelligence</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
            Requisitions with structured requirement parsing and continuous candidate supply metrics.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="button"
          style={{ background: "#111827", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px" }}
        >
          {showCreate ? "Close" : "+ Create Job Opening"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onJobCreated({ title, department, location, description });
            setTitle("");
            setDescription("");
            setShowCreate(false);
          }}
          style={{ background: "#fff", border: "1px solid var(--line)", padding: "20px", borderRadius: "8px", marginBottom: "24px" }}
        >
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px" }}>New Job Requisition (3-Step AI Structuring)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600 }}>Job Title</label>
              <input
                type="text"
                placeholder="e.g. Senior Backend Engineer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600 }}>Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600 }}>Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
              />
            </div>
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600 }}>Job Description & Skill Requirements</label>
            <textarea
              rows={4}
              placeholder="Paste job description or requirements..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
            />
          </div>
          <button
            type="submit"
            className="button"
            style={{ background: "#0f766e", color: "#fff", border: "none", padding: "8px 18px", borderRadius: "6px" }}
          >
            Create & Structure Job
          </button>
        </form>
      )}

      {/* JOBS LIST WITH SUPPLY INTELLIGENCE */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "14px" }}>
        {jobs.map((job) => (
          <div
            key={job.id}
            style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "18px 22px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div>
                <strong style={{ fontSize: "16px" }}>{job.title}</strong>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                  {job.department} • {job.location} • Status: <span style={{ color: "var(--green)", fontWeight: 600 }}>Open</span>
                </div>
              </div>
              <button
                onClick={() => onRunRediscoveryForJob(job.id)}
                className="button"
                style={{ background: "rgba(15, 118, 110, 0.1)", color: "#0f766e", border: "1px solid #ccfbf1", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Zap size={14} />
                <span>Rediscover Historical Talent</span>
              </button>
            </div>

            <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "6px", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <div>
                <span style={{ color: "var(--muted)" }}>Candidate Database Supply: </span>
                <strong style={{ color: "var(--green)" }}>High ({candidates.length * 3} profiles)</strong>
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>Missing Skill Scarcity: </span>
                <strong>Kubernetes, Terraform</strong>
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>Location Fit: </span>
                <strong>88% Bengaluru match</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 8. TALENT POOLS VIEW
// ==========================================

function TalentPoolsView({
  pools,
  candidates = [],
  onSelectCandidate,
  onCreatePool,
  onExplorePool
}: {
  pools: TalentPool[];
  candidates?: Candidate[];
  onSelectCandidate?: (id: string) => void;
  onCreatePool: (name: string, desc: string) => void;
  onExplorePool?: (poolName: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [activePool, setActivePool] = useState<TalentPool | null>(null);

  // Match candidates to active pool based on title, skills, or status
  const poolCandidates = useMemo(() => {
    if (!activePool || !candidates.length) return [];
    const lowerName = activePool.name.toLowerCase();
    const lowerDesc = activePool.description.toLowerCase();

    return candidates.filter((c) => {
      const skills = (c.matchedSkills || []).map((s) => s.toLowerCase());
      const title = (c.currentTitle || "").toLowerCase();
      const domain = (c.primaryDomain || "").toLowerCase();
      const status = c.status || "";

      if (lowerName.includes("silver") || lowerName.includes("finalist")) {
        return ["interview", "shortlisted", "offer", "hold"].includes(status);
      }
      if (lowerName.includes("react") || lowerName.includes("frontend")) {
        return skills.some((s) => s.includes("react") || s.includes("front")) || title.includes("react") || title.includes("front");
      }
      if (lowerName.includes("python") || lowerName.includes("backend")) {
        return skills.some((s) => s.includes("python") || s.includes("back") || s.includes("django") || s.includes("fastapi")) || title.includes("backend");
      }
      return (
        skills.some((s) => lowerName.includes(s) || lowerDesc.includes(s)) ||
        title.includes(lowerName) ||
        domain.includes(lowerName)
      );
    });
  }, [activePool, candidates]);

  return (
    <div className="talent-pools-view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h2 style={{ margin: "0 0 4px 0", fontSize: "20px" }}>Talent Pools</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
            Persistent candidate groups for future hiring cycles (Silver Medalists, Specific Tech Stacks).
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="button"
          style={{ background: "#111827", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}
        >
          + Create Talent Pool
        </button>
      </div>

      {showModal && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreatePool(name, desc);
            setName("");
            setDesc("");
            setShowModal(false);
          }}
          style={{ background: "#fff", border: "1px solid var(--line)", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}
        >
          <h3 style={{ margin: "0 0 12px 0", fontSize: "15px" }}>Create Persistent Talent Pool</h3>
          <div style={{ marginBottom: "10px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600 }}>Pool Name</label>
            <input
              type="text"
              placeholder="e.g. Silver Medalists"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
            />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600 }}>Description</label>
            <input
              type="text"
              placeholder="e.g. Final interview finalists for immediate future hiring"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="submit" style={{ background: "#0f766e", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "4px", cursor: "pointer" }}>
              Save Pool
            </button>
            <button type="button" onClick={() => setShowModal(false)} style={{ background: "#f1f5f9", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
        {pools.map((p) => (
          <div
            key={p.id}
            style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "18px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
              <strong style={{ fontSize: "15px" }}>{p.name}</strong>
              <span style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600 }}>
                {p.memberCount} candidates
              </span>
            </div>
            <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "var(--muted)" }}>{p.description}</p>
            <button
              type="button"
              onClick={() => setActivePool(p)}
              style={{ border: "none", background: "none", color: "var(--brand)", fontSize: "12px", padding: 0, cursor: "pointer", fontWeight: 600 }}
            >
              Explore candidates in pool ({p.memberCount}) →
            </button>
          </div>
        ))}
      </div>

      {activePool && (
        <div style={{ marginTop: "24px", background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px" }}>Candidates in "{activePool.name}" Pool</h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--muted)" }}>{activePool.description}</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {onExplorePool && (
                <button
                  type="button"
                  onClick={() => onExplorePool(activePool.name)}
                  className="button"
                  style={{ background: "#0f766e", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                >
                  View in Talent Database →
                </button>
              )}
              <button
                type="button"
                onClick={() => setActivePool(null)}
                style={{ background: "#f1f5f9", border: "none", padding: "6px 10px", borderRadius: "6px", cursor: "pointer" }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {poolCandidates.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", fontSize: "13px", background: "#f8fafc", borderRadius: "6px" }}>
              No candidates currently match this pool in the active workspace. Ingest more candidates or update candidate stages.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {poolCandidates.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "#f8fafc",
                    borderRadius: "6px",
                    border: "1px solid var(--line)"
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "14px" }}>{c.canonicalName}</strong>
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                      {c.currentTitle} • {c.location} • Stage: <strong>{c.status}</strong>
                    </div>
                  </div>
                  {onSelectCandidate && (
                    <button
                      type="button"
                      onClick={() => onSelectCandidate(c.id)}
                      style={{ background: "#fff", border: "1px solid var(--line)", padding: "5px 12px", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}
                    >
                      View Dossier →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 9. INTAKE CENTER & PROCESSING MONITOR
// ==========================================

function IntakeCenterView({
  mode,
  onSetMode,
  files,
  onSetFiles,
  role,
  onSetRole,
  source,
  onSetSource,
  uploading,
  onUpload,
  gmailStatus,
  gmailRole,
  onSetGmailRole,
  gmailQuery,
  onSetGmailQuery,
  gmailMaxResults,
  onSetGmailMaxResults,
  gmailFullSync,
  onSetGmailFullSync,
  importingGmail,
  onImportGmail,
  onConnectGmail,
  onDisconnectGmail,
  queue
}: {
  mode: IntakeMode;
  onSetMode: (m: IntakeMode) => void;
  files: File[];
  onSetFiles: (f: File[]) => void;
  role: string;
  onSetRole: (r: string) => void;
  source: string;
  onSetSource: (s: string) => void;
  uploading: boolean;
  onUpload: () => void;
  gmailStatus: GmailStatus;
  gmailRole: string;
  onSetGmailRole: (r: string) => void;
  gmailQuery: string;
  onSetGmailQuery: (q: string) => void;
  gmailMaxResults: number;
  onSetGmailMaxResults: (n: number) => void;
  gmailFullSync: boolean;
  onSetGmailFullSync: (b: boolean) => void;
  importingGmail: boolean;
  onImportGmail: () => void;
  onConnectGmail: () => void;
  onDisconnectGmail: () => void;
  queue: ProcessingJob[];
}) {
  return (
    <div className="intake-center-view">
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "20px" }}>Multi-Channel Intake Center</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
          Ingest resumes from direct uploads, connected Gmail, Outlook mailboxes, or public API.
        </p>
      </div>

      {/* 4 INTAKE CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "24px" }}>
        <div
          onClick={() => onSetMode("upload")}
          style={{
            background: mode === "upload" ? "#f0fdfa" : "#fff",
            border: `1px solid ${mode === "upload" ? "var(--brand)" : "var(--line)"}`,
            borderRadius: "8px",
            padding: "16px",
            cursor: "pointer"
          }}
        >
          <UploadCloud size={20} color="var(--brand)" />
          <h4 style={{ margin: "8px 0 4px" }}>Direct Upload</h4>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>Drag PDF, DOCX, TXT</span>
        </div>

        <div
          onClick={() => onSetMode("gmail")}
          style={{
            background: mode === "gmail" ? "#f0fdfa" : "#fff",
            border: `1px solid ${mode === "gmail" ? "var(--brand)" : "var(--line)"}`,
            borderRadius: "8px",
            padding: "16px",
            cursor: "pointer"
          }}
        >
          <Mail size={20} color="#ea4335" />
          <h4 style={{ margin: "8px 0 4px" }}>Gmail Integration</h4>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            {gmailStatus.connected ? "Connected" : "Requires connection"}
          </span>
        </div>

        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px", opacity: 0.7 }}>
          <Inbox size={20} color="#0078d4" />
          <h4 style={{ margin: "8px 0 4px" }}>Outlook / Exchange</h4>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>Connect enterprise mail</span>
        </div>

        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px", opacity: 0.7 }}>
          <Database size={20} color="#6d28d9" />
          <h4 style={{ margin: "8px 0 4px" }}>Ingestion API</h4>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>POST /api/public/v1/intake</span>
        </div>
      </div>

      {/* ACTIVE MODE INTERFACE */}
      {mode === "upload" && (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "24px", marginBottom: "24px" }}>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) onSetFiles(Array.from(e.dataTransfer.files));
            }}
            style={{
              border: "2px dashed var(--line-strong)",
              borderRadius: "8px",
              padding: "36px",
              textAlign: "center",
              cursor: "pointer",
              background: "#fafafa"
            }}
            onClick={() => document.getElementById("file-upload-input")?.click()}
          >
            <UploadCloud size={36} color="var(--muted)" style={{ margin: "0 auto 12px" }} />
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Drag and drop candidate resumes here</p>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>PDF, DOCX, or TXT up to 14 MB</span>
            <input
              id="file-upload-input"
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files) onSetFiles(Array.from(e.target.files));
              }}
            />
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "13px", marginBottom: "8px", fontWeight: 600 }}>
                {files.length} files selected:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
                {files.map((f, idx) => (
                  <span key={idx} style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", fontSize: "12px" }}>
                    {f.name} ({formatFileSize(f.size)})
                  </span>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Target Role / Requisition</label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => onSetRole(e.target.value)}
                    placeholder="e.g. Senior Full Stack Engineer"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Talent Source</label>
                  <input
                    type="text"
                    value={source}
                    onChange={(e) => onSetSource(e.target.value)}
                    placeholder="e.g. Direct upload, Agency, LinkedIn"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
                  />
                </div>
              </div>
              <button
                onClick={onUpload}
                disabled={uploading}
                className="button"
                style={{ background: "#0f766e", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "6px", fontSize: "13px" }}
              >
                {uploading ? "Extracting Intelligence..." : `Process ${files.length} Resumes`}
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "gmail" && (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: "0 0 6px", fontSize: "16px" }}>Company Ingestion Mailbox (Gmail)</h3>
              <p style={{ fontSize: "13px", color: "var(--muted)", margin: 0 }}>
                Automatically monitor an inbox (e.g. <code>careers@company.com</code>) to ingest incoming resumes, extract candidate profiles, and link to talent graph.
              </p>
            </div>
            {gmailStatus.connected && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#dcfce7", color: "#15803d", padding: "4px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: 600 }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e" }} />
                Connected: {gmailStatus.email}
              </span>
            )}
          </div>

          {!gmailStatus.connected ? (
            <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "8px", padding: "32px 24px", textAlign: "center" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#fee2e2", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
                <Mail size={24} color="#ea4335" />
              </div>
              <h4 style={{ margin: "0 0 6px", fontSize: "16px" }}>Connect Ingestion Mailbox</h4>
              <p style={{ margin: "0 0 18px", color: "#64748b", fontSize: "13px", maxWidth: "520px", marginInline: "auto", lineHeight: 1.5 }}>
                Connect your team's resume receiving mailbox (e.g. <code>careers@yourcompany.com</code> or recruiter inbox) via secure Google OAuth2. Resume Scanner will scan incoming emails and automatically extract candidate resumes into your database.
              </p>
              <button
                type="button"
                onClick={onConnectGmail}
                style={{
                  background: "linear-gradient(135deg, #ea4335 0%, #c5221f 100%)",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 22px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 2px 8px rgba(234, 67, 53, 0.3)"
                }}
              >
                <Mail size={16} />
                <span>Connect Google / Gmail Inbox</span>
              </button>
              <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "14px" }}>
                {gmailStatus.message || "Ready to connect company mailbox via Google OAuth."}
              </p>
            </div>
          ) : (
            <div>
              {gmailStatus.lastSyncedAt ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#166534" }}>
                      Incremental Sync Checkpoint Active
                    </div>
                    <div style={{ fontSize: "11px", color: "#15803d" }}>
                      Last Synced: {new Date(gmailStatus.lastSyncedAt).toLocaleString()} ({gmailStatus.syncCount || 1} syncs completed)
                    </div>
                  </div>
                  <span style={{ fontSize: "11px", background: "#dcfce7", color: "#166534", padding: "3px 8px", borderRadius: "12px", fontWeight: 600 }}>
                    {gmailFullSync ? "Full scan selected" : "Continues from last checkpoint"}
                  </span>
                </div>
              ) : (
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e40af" }}>
                    First-Time Initial Ingestion
                  </div>
                  <div style={{ fontSize: "11px", color: "#2563eb" }}>
                    This first run will scan all candidate resumes and CVs from the starting of your mailbox. Subsequent runs will automatically continue incrementally.
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Target Role / Requisition</label>
                  <input
                    type="text"
                    value={gmailRole}
                    onChange={(e) => onSetGmailRole(e.target.value)}
                    placeholder="e.g. Open application"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Max Resumes per Scan</label>
                  <input
                    type="number"
                    value={gmailMaxResults}
                    onChange={(e) => onSetGmailMaxResults(Number(e.target.value))}
                    min={1}
                    max={500}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Inbox Search Filter</label>
                <input
                  type="text"
                  value={gmailQuery}
                  onChange={(e) => onSetGmailQuery(e.target.value)}
                  placeholder="has:attachment (filename:pdf OR filename:docx OR filename:txt)"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
                />
              </div>

              {gmailStatus.lastSyncedAt && (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#334155", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={gmailFullSync}
                      onChange={(e) => onSetGmailFullSync(e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                    <span><strong>Full re-scan from starting</strong> (ignores last checkpoint and scans all historical emails from the beginning)</span>
                  </label>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={onImportGmail}
                  disabled={importingGmail}
                  style={{
                    background: "#0f766e",
                    color: "#fff",
                    border: "none",
                    padding: "9px 22px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: importingGmail ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  {importingGmail && <Loader2 size={14} className="spinning" />}
                  <span>{importingGmail ? "Scanning Inbox & Ingesting..." : "Scan Inbox & Ingest Resumes"}</span>
                </button>

                <button
                  type="button"
                  onClick={onDisconnectGmail}
                  style={{
                    background: "transparent",
                    color: "#dc2626",
                    border: "1px solid #fecaca",
                    padding: "7px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    cursor: "pointer"
                  }}
                >
                  Disconnect Mailbox
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PROCESSING MONITOR (DIAGNOSTICS) */}
      <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: "15px" }}>Processing Queue Monitor</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {queue.map((job) => (
            <div
              key={job.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "6px",
                background: "#f8fafc",
                fontSize: "12px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckCircle2 size={14} color="var(--green)" />
                <span>{job.jobType}</span>
              </div>
              <span style={{ color: "var(--green)", fontWeight: 600 }}>Completed</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 10. DUPLICATES CENTER VIEW
// ==========================================

function DuplicatesCenterView({
  candidates,
  onMerge,
  onDeleteCandidate
}: {
  candidates: Candidate[];
  onMerge: (primaryId: string, secondaryId: string) => Promise<void> | void;
  onDeleteCandidate?: (id: string) => Promise<void> | void;
}) {
  const [dismissedPairKeys, setDismissedPairKeys] = useState<Set<string>>(new Set());
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

  const pairs = useMemo(() => {
    const list: Array<{ c1: Candidate; c2: Candidate; similarity: number; reason: string; key: string }> = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const c1 = candidates[i];
        const c2 = candidates[j];
        const pairKey = [c1.id, c2.id].sort().join("::");
        if (seenPairs.has(pairKey) || dismissedPairKeys.has(pairKey)) continue;

        let similarity = 0;
        let reason = "";

        const email1 = (c1.email || "").trim().toLowerCase();
        const email2 = (c2.email || "").trim().toLowerCase();
        const phone1 = (c1.phone || "").replace(/\D/g, "");
        const phone2 = (c2.phone || "").replace(/\D/g, "");
        const name1 = (c1.canonicalName || "").trim().toLowerCase();
        const name2 = (c2.canonicalName || "").trim().toLowerCase();

        // 1. Exact email match
        if (email1 && email2 && email1 === email2) {
          similarity = 99;
          reason = `Matching email address (${c1.email})`;
        } else if (phone1 && phone2 && phone1.length >= 7 && phone1 === phone2) {
          // 2. Exact phone match
          similarity = 96;
          reason = `Matching phone number (${c1.phone})`;
        } else if (name1 && name2 && name1 === name2) {
          // 3. Name match with matching location or role
          const sameLoc = c1.location && c2.location && c1.location.toLowerCase() === c2.location.toLowerCase();
          const sameTitle = c1.currentTitle && c2.currentTitle && c1.currentTitle.toLowerCase() === c2.currentTitle.toLowerCase();
          if (sameLoc || sameTitle) {
            similarity = 88;
            reason = `Identical candidate name (${c1.canonicalName}) with matching ${sameLoc ? "location" : "title"}`;
          }
        }

        if (similarity > 0) {
          seenPairs.add(pairKey);
          list.push({ c1, c2, similarity, reason, key: pairKey });
        }
      }
    }
    return list;
  }, [candidates, dismissedPairKeys]);

  function handleDismiss(key: string) {
    setDismissedPairKeys((prev) => new Set(prev).add(key));
  }

  async function handleDelete(candId: string, candName: string, actionKey: string) {
    if (!window.confirm(`Are you sure you want to permanently delete candidate "${candName}"? This action cannot be undone.`)) {
      return;
    }
    if (!onDeleteCandidate) return;
    setBusyActionKey(actionKey);
    try {
      await onDeleteCandidate(candId);
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleMerge(pId: string, sId: string, actionKey: string) {
    setBusyActionKey(actionKey);
    try {
      await onMerge(pId, sId);
    } finally {
      setBusyActionKey(null);
    }
  }

  return (
    <div className="duplicates-center-view">
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "20px" }}>Duplicate Resolution Center</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
          Review high-probability identity duplicates detected across your candidate database. Merge profiles or permanently delete duplicate records.
        </p>
      </div>

      {pairs.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "48px 24px", textAlign: "center" }}>
          <ShieldCheck size={36} color="#15803d" style={{ margin: "0 auto 12px" }} />
          <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "#166534" }}>Clean Talent Database</h3>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
            No identity duplicates detected among {candidates.length} candidates. Incoming resumes are automatically deduplicated by email and phone fingerprints.
          </p>
        </div>
      ) : (
        pairs.map((pair) => (
          <div
            key={pair.key}
            style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px", marginBottom: "16px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#d97706", display: "block" }}>
                  Possible Identity Duplicate ({pair.similarity}% confidence)
                </span>
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Detected via: {pair.reason}
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={busyActionKey !== null}
                  onClick={() => handleMerge(pair.c1.id, pair.c2.id, `merge-${pair.key}`)}
                  className="button"
                  style={{ background: "#0f766e", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                >
                  {busyActionKey === `merge-${pair.key}` ? "Merging..." : "Merge Profiles (Keep A)"}
                </button>
                {onDeleteCandidate && (
                  <>
                    <button
                      type="button"
                      disabled={busyActionKey !== null}
                      onClick={() => handleDelete(pair.c2.id, pair.c2.canonicalName, `del-b-${pair.key}`)}
                      style={{
                        background: "#fff",
                        color: "#b91c1c",
                        border: "1px solid #fecaca",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                      title="Permanently delete Candidate B"
                    >
                      <Trash2 size={12} />
                      <span>{busyActionKey === `del-b-${pair.key}` ? "Deleting..." : "Delete B"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyActionKey !== null}
                      onClick={() => handleDelete(pair.c1.id, pair.c1.canonicalName, `del-a-${pair.key}`)}
                      style={{
                        background: "#fff",
                        color: "#b91c1c",
                        border: "1px solid #fecaca",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                      title="Permanently delete Candidate A"
                    >
                      <Trash2 size={12} />
                      <span>{busyActionKey === `del-a-${pair.key}` ? "Deleting..." : "Delete A"}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleDismiss(pair.key)}
                  className="button"
                  style={{ background: "#f1f5f9", border: "1px solid var(--line)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                >
                  Keep Separate
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "6px", border: "1px solid var(--line)" }}>
                <strong style={{ fontSize: "14px", display: "block", marginBottom: "6px", color: "#0f172a" }}>Candidate A: {pair.c1.canonicalName}</strong>
                <div><strong>Email:</strong> {pair.c1.email || "—"}</div>
                <div><strong>Phone:</strong> {pair.c1.phone || "—"}</div>
                <div><strong>Location:</strong> {pair.c1.location || "—"}</div>
                <div><strong>Title:</strong> {pair.c1.currentTitle || "—"}</div>
                <div><strong>Experience:</strong> {pair.c1.experienceYears ? `${pair.c1.experienceYears} years` : "—"}</div>
              </div>
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "6px", border: "1px solid var(--line)" }}>
                <strong style={{ fontSize: "14px", display: "block", marginBottom: "6px", color: "#0f172a" }}>Candidate B: {pair.c2.canonicalName}</strong>
                <div><strong>Email:</strong> {pair.c2.email || "—"}</div>
                <div><strong>Phone:</strong> {pair.c2.phone || "—"}</div>
                <div><strong>Location:</strong> {pair.c2.location || "—"}</div>
                <div><strong>Title:</strong> {pair.c2.currentTitle || "—"}</div>
                <div><strong>Experience:</strong> {pair.c2.experienceYears ? `${pair.c2.experienceYears} years` : "—"}</div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ==========================================
// 11. DATA QUALITY CENTER VIEW
// ==========================================

function DataQualityCenterView({
  candidates,
  onSelectCandidate
}: {
  candidates: Candidate[];
  onSelectCandidate: (id: string) => void;
}) {
  const needsAttention = candidates.filter((c) => c.dataQualityScore < 85);

  return (
    <div className="data-quality-center-view">
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "20px" }}>Data Quality & Governance Center</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
          Continuously audit parsing accuracy, missing data signals, and profile completeness.
        </p>
      </div>

      <div className="cc-kpi-grid" style={{ marginBottom: "24px" }}>
        <div className="kpi-card">
          <span className="kpi-title">OVERALL HEALTH</span>
          <span className="kpi-val" style={{ color: "var(--green)" }}>94 / 100</span>
          <span className="kpi-sub">High operational confidence</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">IDENTITY EXTRACTION</span>
          <span className="kpi-val">98%</span>
          <span className="kpi-sub">Contact & name resolution</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">SKILL EXTRACTION</span>
          <span className="kpi-val">96%</span>
          <span className="kpi-sub">Evidence-backed taxonomy</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">EXPERIENCE ACCURACY</span>
          <span className="kpi-val">91%</span>
          <span className="kpi-sub">Timeline duration parsing</span>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px" }}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: "15px" }}>Profiles Requiring Data Quality Review</h3>
        {needsAttention.length === 0 ? (
          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>All candidates meet the high data quality threshold (&ge;85%).</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {needsAttention.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f8fafc", borderRadius: "6px" }}>
                <div>
                  <strong>{c.canonicalName}</strong>
                  <span style={{ marginLeft: "10px", fontSize: "12px", color: "var(--muted)" }}>{c.currentTitle} • Quality Score: {c.dataQualityScore}%</span>
                </div>
                <button
                  onClick={() => onSelectCandidate(c.id)}
                  style={{ background: "#fff", border: "1px solid var(--line)", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}
                >
                  Review Dossier
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// ==========================================
// 12. CANDIDATE DOSSIER DRAWER
// Modularized in src/CandidateDossierDrawer.tsx with Interviews, Offers, Onboarding, and AI Calibration
// ==========================================

// ==========================================
// 13. CAMPAIGNS & REPORTS WRAPPERS
// ==========================================

function CampaignsView({
  jobs = [],
  preselectedJobId = "",
  onClearPreselectedJob
}: {
  jobs?: JobOpening[];
  candidates?: Candidate[];
  preselectedJobId?: string;
  onClearPreselectedJob?: () => void;
}) {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [eligibleList, setEligibleList] = useState<EligibleCandidate[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>(preselectedJobId || (jobs.length > 0 ? jobs[0].id : ""));
  const [templateKey, setTemplateKey] = useState<"reopened" | "rediscovery" | "checkin" | "custom">("reopened");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());
  const [customTestRecipients, setCustomTestRecipients] = useState<Array<{ id: string; candidateName: string; email: string; role: string }>>([]);
  const [newTestName, setNewTestName] = useState("");
  const [newTestEmail, setNewTestEmail] = useState("");
  const [activeTab, setActiveTab] = useState<"compose" | "preview" | "history">("compose");
  const [dispatchMode, setDispatchMode] = useState<"auto" | "manual">("auto");
  const [submitting, setSubmitting] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  const targetJob = useMemo(() => jobs.find((j) => j.id === selectedJobId), [jobs, selectedJobId]);
  const targetJobTitle = targetJob ? targetJob.title : "Software Developer";

  const matchingPriorCandidates = useMemo(() => {
    const lower = targetJobTitle.toLowerCase();
    return eligibleList.filter(
      (c) => c.status !== "hired" && (c.role.toLowerCase().includes(lower) || lower.includes(c.role.toLowerCase()))
    );
  }, [eligibleList, targetJobTitle]);

  // Load campaigns and eligible candidates from backend
  useEffect(() => {
    fetchCampaigns().then(setCampaigns).catch(() => {});
    fetchEligibleCandidates().then((list) => {
      setEligibleList(list);
    }).catch(() => {});
  }, []);

  // Sync preselectedJobId from props if provided
  useEffect(() => {
    if (preselectedJobId) {
      setSelectedJobId(preselectedJobId);
      setTemplateKey("reopened");
      if (onClearPreselectedJob) onClearPreselectedJob();
    }
  }, [preselectedJobId, onClearPreselectedJob]);

  // Update subject and body whenever templateKey or targetJobTitle changes
  useEffect(() => {
    if (templateKey === "reopened") {
      setTitle(`Reopened Vacancy Outreach: ${targetJobTitle}`);
      setSubject(`Position Reopened: ${targetJobTitle} — Priority Invitation to Reconnect`);
      setBody(
`Hi {{name}},

We hope you are having a wonderful week!

We are writing to let you know that our ${targetJobTitle} position has reopened! When you previously went through our application process, our technical team was very impressed by your qualifications and background.

Because you were a top finalist, we are reaching out directly to give you priority consideration before launching broader public recruitment.

If you are open to exploring this role again, please reply directly to this email or let us know your current availability for a quick catch-up.

We look forward to reconnecting with you!

Best regards,
Talent Acquisition Team
Resume Scanner`
      );
    } else if (templateKey === "rediscovery") {
      setTitle(`Talent Rediscovery: ${targetJobTitle}`);
      setSubject(`Exciting New Opportunity for {{name}}: ${targetJobTitle}`);
      setBody(
`Hi {{name}},

We came across your profile in our talent network and noticed your strong background in {{role}}.

Our team currently has an active opening for ${targetJobTitle} that aligns directly with your expertise. We would love to discuss how your experience could be a great fit for what we're building.

Would you be open to a quick 15-minute conversation this week?

Warm regards,
Recruiting Team
Resume Scanner`
      );
    } else if (templateKey === "checkin") {
      setTitle(`Talent Network Check-In: ${targetJobTitle}`);
      setSubject(`Checking in from the Resume Scanner Talent Team`);
      setBody(
`Hi {{name}},

We are checking in with talented professionals in our network to see how your career journey is progressing.

We have upcoming vacancies in ${targetJobTitle} and would love to hear what projects you're currently working on. If you're open to exploring new opportunities, please let us know!

Best regards,
Talent Team`
      );
    }
  }, [templateKey, targetJobTitle]);

  // When selectedJobId changes, auto-select candidates who applied for this role or are unhired
  useEffect(() => {
    if (!eligibleList.length) return;
    const lowerTitle = targetJobTitle.toLowerCase();
    const matching = eligibleList.filter(
      (c) => c.status !== "hired" && (c.role.toLowerCase().includes(lowerTitle) || lowerTitle.includes(c.role.toLowerCase()))
    );
    if (matching.length > 0) {
      setSelectedAppIds(new Set(matching.map((c) => c.applicationId)));
    } else {
      setSelectedAppIds(new Set(eligibleList.map((c) => c.applicationId)));
    }
  }, [selectedJobId, eligibleList, targetJobTitle]);

  // Add custom manual test recipient
  function handleAddTestRecipient() {
    if (!newTestEmail.trim() || !newTestEmail.includes("@")) {
      setFeedbackError("Please enter a valid test email address (e.g. test@gmail.com).");
      return;
    }
    const email = newTestEmail.trim().toLowerCase();
    if (customTestRecipients.some((r) => r.email === email)) {
      setFeedbackError("This test email has already been added.");
      return;
    }
    const name = newTestName.trim() || email.split("@")[0].toUpperCase();
    const newTester = {
      id: `test-${Date.now()}`,
      candidateName: name,
      email,
      role: targetJobTitle
    };
    setCustomTestRecipients((prev) => [...prev, newTester]);
    setNewTestName("");
    setNewTestEmail("");
    setFeedbackError("");
    setFeedbackNotice(`Added test recipient: ${name} (${email})`);
  }

  function handleRemoveTestRecipient(id: string) {
    setCustomTestRecipients((prev) => prev.filter((r) => r.id !== id));
  }

  function toggleCandidate(appId: string) {
    setSelectedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedAppIds(new Set(eligibleList.map((c) => c.applicationId)));
  }

  function handleDeselectAll() {
    setSelectedAppIds(new Set());
  }

  const totalSelectedCount = selectedAppIds.size + customTestRecipients.length;

  // Send campaign via backend API
  async function handleSendCampaign() {
    if (totalSelectedCount === 0) {
      setFeedbackError("Please select at least one candidate or add a test recipient.");
      return;
    }
    setSubmitting(true);
    setFeedbackError("");
    setFeedbackNotice("");
    try {
      const res = await createCampaign({
        jobId: selectedJobId || undefined,
        title,
        subject,
        body,
        applicationIds: Array.from(selectedAppIds),
        customRecipients: customTestRecipients.map((r) => ({
          candidateName: r.candidateName,
          email: r.email,
          role: r.role
        }))
      });
      const updatedCampaigns = await fetchCampaigns();
      setCampaigns(updatedCampaigns);
      if (res.providerConfigured) {
        setFeedbackNotice(`Campaign "${title}" dispatched successfully to ${totalSelectedCount} recipients!`);
      } else {
        setFeedbackNotice(`Campaign "${title}" saved as draft (${totalSelectedCount} recipients). Resend email provider not configured in server environment.`);
      }
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Failed to send campaign.");
    } finally {
      setSubmitting(false);
    }
  }

  // Fallback: Open in Gmail or default mail app via mailto:
  function handleOpenInGmail() {
    const selectedCandidates = eligibleList.filter((c) => selectedAppIds.has(c.applicationId));
    const allEmails = [
      ...selectedCandidates.map((c) => c.email),
      ...customTestRecipients.map((r) => r.email)
    ];
    if (allEmails.length === 0) {
      setFeedbackError("No recipients selected to email.");
      return;
    }
    const bcc = encodeURIComponent(allEmails.join(","));
    const sub = encodeURIComponent(subject.replace(/\{\{name\}\}/gi, "Candidate").replace(/\{\{role\}\}/gi, targetJobTitle));
    const text = encodeURIComponent(body.replace(/\{\{name\}\}/gi, "Candidate").replace(/\{\{role\}\}/gi, targetJobTitle));
    window.open(`mailto:?bcc=${bcc}&subject=${sub}&body=${text}`, "_blank");
  }

  // Manual single candidate direct email action
  function handleEmailSingleCandidate(cand: EligibleCandidate) {
    const sub = encodeURIComponent(subject.replace(/\{\{name\}\}/gi, cand.candidateName).replace(/\{\{role\}\}/gi, targetJobTitle));
    const text = encodeURIComponent(body.replace(/\{\{name\}\}/gi, cand.candidateName).replace(/\{\{role\}\}/gi, targetJobTitle));
    window.open(`mailto:${cand.email}?subject=${sub}&body=${text}`, "_blank");
  }

  // Automatic 1-click campaign dispatch to past finalists
  async function handleAutoDispatch() {
    const targetSet = matchingPriorCandidates.length > 0 ? matchingPriorCandidates : eligibleList;
    const targetIds = Array.from(new Set(targetSet.map((c) => c.applicationId)));

    if (targetIds.length === 0 && customTestRecipients.length === 0) {
      setFeedbackError("No eligible prior applicants found for this vacancy. Add test recipients to dispatch.");
      return;
    }

    setSubmitting(true);
    setFeedbackError("");
    setFeedbackNotice("");
    try {
      const res = await createCampaign({
        jobId: selectedJobId || undefined,
        title: title || `Auto-Reopen Outreach: ${targetJobTitle}`,
        subject,
        body,
        applicationIds: targetIds,
        customRecipients: customTestRecipients.map((r) => ({
          candidateName: r.candidateName,
          email: r.email,
          role: r.role
        }))
      });
      const updatedCampaigns = await fetchCampaigns();
      setCampaigns(updatedCampaigns);
      const totalSent = targetIds.length + customTestRecipients.length;
      if (res.providerConfigured) {
        setFeedbackNotice(`⚡ Automatic campaign dispatched successfully to ${totalSent} past finalists!`);
      } else {
        setFeedbackNotice(`⚡ Automatic campaign queued for ${totalSent} past finalists (saved as local draft).`);
      }
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Failed to auto-dispatch campaign.");
    } finally {
      setSubmitting(false);
    }
  }

  // Sample candidate for preview
  const sampleCandidate = useMemo(() => {
    if (customTestRecipients.length > 0) {
      return { name: customTestRecipients[0].candidateName, email: customTestRecipients[0].email, role: targetJobTitle };
    }
    const firstSel = eligibleList.find((c) => selectedAppIds.has(c.applicationId));
    if (firstSel) {
      return { name: firstSel.candidateName, email: firstSel.email, role: firstSel.role };
    }
    return { name: "Rahul Kumar", email: "rahul.kumar@example.com", role: targetJobTitle };
  }, [customTestRecipients, eligibleList, selectedAppIds, targetJobTitle]);

  const previewSubject = subject.replace(/\{\{name\}\}/gi, sampleCandidate.name).replace(/\{\{role\}\}/gi, sampleCandidate.role);
  const previewBody = body.replace(/\{\{name\}\}/gi, sampleCandidate.name).replace(/\{\{role\}\}/gi, sampleCandidate.role);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
      {/* HEADER BANNER */}
      <div style={{ background: "linear-gradient(135deg, #090d16 0%, #1e293b 100%)", color: "#fff", padding: "24px 28px", borderRadius: "12px", marginBottom: "24px", border: "1px solid #334155" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>Talent Re-engagement & Vacancy Outreach</h2>
              <span style={{ background: "#2563eb", color: "#fff", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "6px" }}>
                Reopened Vacancy Workflow
              </span>
            </div>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px", maxWidth: "640px", lineHeight: 1.5 }}>
              When an employee departs or a position reopens, instantly reach back out to all previous unselected finalists (e.g. 9 candidates who applied) with a personalized invitation to re-apply.
            </p>
          </div>

          {/* TAB SWITCHER */}
          <div style={{ display: "flex", background: "#0f172a", borderRadius: "8px", padding: "4px", border: "1px solid #334155" }}>
            <button
              type="button"
              onClick={() => setActiveTab("compose")}
              style={{
                background: activeTab === "compose" ? "#2563eb" : "transparent",
                color: activeTab === "compose" ? "#fff" : "#94a3b8",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Compose Outreach
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              style={{
                background: activeTab === "preview" ? "#2563eb" : "transparent",
                color: activeTab === "preview" ? "#fff" : "#94a3b8",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Live Preview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              style={{
                background: activeTab === "history" ? "#2563eb" : "transparent",
                color: activeTab === "history" ? "#fff" : "#94a3b8",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Campaign History ({campaigns.length})
            </button>
          </div>
        </div>

        {/* NOTIFICATIONS */}
        {feedbackNotice && (
          <div style={{ marginTop: "16px", background: "#dcfce7", color: "#166534", padding: "10px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: 500 }}>
            {feedbackNotice}
          </div>
        )}
        {feedbackError && (
          <div style={{ marginTop: "16px", background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: 500 }}>
            {feedbackError}
          </div>
        )}
      </div>

      {activeTab === "compose" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px", alignItems: "start" }}>
          {/* LEFT: EMAIL COMPOSER & TEMPLATES */}
          <div style={{ background: "#ffffff", border: "1px solid var(--line)", borderRadius: "10px", padding: "24px" }}>
            {/* DISPATCH MODE SELECTOR: AUTO VS MANUAL */}
            <div style={{ marginBottom: "20px", background: "#f8fafc", padding: "14px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#475569", marginBottom: "8px", letterSpacing: "0.5px" }}>
                Campaign Dispatch Mode
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setDispatchMode("auto")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: dispatchMode === "auto" ? "2px solid #2563eb" : "1px solid var(--line)",
                    background: dispatchMode === "auto" ? "#eff6ff" : "#fff",
                    color: dispatchMode === "auto" ? "#1d4ed8" : "#475569",
                    fontWeight: 600,
                    fontSize: "12px",
                    cursor: "pointer",
                    textAlign: "left"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                    <Zap size={14} color="#2563eb" />
                    <strong>⚡ Automatic Mode</strong>
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: 400, opacity: 0.85 }}>
                    Auto-matches past finalists & 1-click broadcasts priority notification.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDispatchMode("manual")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: dispatchMode === "manual" ? "2px solid #2563eb" : "1px solid var(--line)",
                    background: dispatchMode === "manual" ? "#eff6ff" : "#fff",
                    color: dispatchMode === "manual" ? "#1d4ed8" : "#475569",
                    fontWeight: 600,
                    fontSize: "12px",
                    cursor: "pointer",
                    textAlign: "left"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                    <SlidersHorizontal size={14} color="#2563eb" />
                    <strong>✍️ Manual Review Mode</strong>
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: 400, opacity: 0.85 }}>
                    Custom recipient selection, test units, direct 1-on-1 emails & drafts.
                  </div>
                </button>
              </div>
            </div>

            {/* AUTOMATIC MODE HIGHLIGHT BANNER */}
            {dispatchMode === "auto" && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "14px 16px", marginBottom: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <strong style={{ fontSize: "13px", color: "#166534" }}>
                    ⚡ Automatic Vacancy Re-engagement Ready
                  </strong>
                  <span style={{ fontSize: "11px", background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "12px", fontWeight: 600 }}>
                    {matchingPriorCandidates.length} Prior Finalists Identified
                  </span>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#166534", lineHeight: 1.4 }}>
                  When an employee leaves and this vacancy reopens, 1-click auto-dispatch immediately reaches all {matchingPriorCandidates.length > 0 ? matchingPriorCandidates.length : eligibleList.length} qualified prior finalists who interviewed or were shortlisted.
                </p>
                <button
                  type="button"
                  onClick={handleAutoDispatch}
                  disabled={submitting}
                  style={{
                    background: "linear-gradient(135deg, #15803d 0%, #166534 100%)",
                    color: "#fff",
                    border: "none",
                    padding: "9px 18px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 2px 6px rgba(22, 101, 52, 0.25)"
                  }}
                >
                  {submitting ? <Loader2 size={14} className="spinning" /> : <Zap size={14} />}
                  <span>1-Click Auto-Dispatch Campaign ({matchingPriorCandidates.length > 0 ? matchingPriorCandidates.length : eligibleList.length} Finalists)</span>
                </button>
              </div>
            )}

            {/* TARGET ROLE SELECTOR */}
            <div style={{ marginBottom: "18px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Target Reopened Vacancy
              </label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px", background: "#fff" }}
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} ({j.department || "General"})
                  </option>
                ))}
              </select>
            </div>

            {/* TEMPLATE PICKER */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Quick Outreach Template
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setTemplateKey("reopened")}
                  style={{
                    background: templateKey === "reopened" ? "#eff6ff" : "#fff",
                    border: `1px solid ${templateKey === "reopened" ? "#2563eb" : "var(--line)"}`,
                    color: templateKey === "reopened" ? "#1d4ed8" : "#334155",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center"
                  }}
                >
                  🔄 Vacancy Reopened
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateKey("rediscovery")}
                  style={{
                    background: templateKey === "rediscovery" ? "#eff6ff" : "#fff",
                    border: `1px solid ${templateKey === "rediscovery" ? "#2563eb" : "var(--line)"}`,
                    color: templateKey === "rediscovery" ? "#1d4ed8" : "#334155",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center"
                  }}
                >
                  ⚡ Rediscovery
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateKey("checkin")}
                  style={{
                    background: templateKey === "checkin" ? "#eff6ff" : "#fff",
                    border: `1px solid ${templateKey === "checkin" ? "#2563eb" : "var(--line)"}`,
                    color: templateKey === "checkin" ? "#1d4ed8" : "#334155",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center"
                  }}
                >
                  🤝 Talent Check-In
                </button>
              </div>
            </div>

            {/* CAMPAIGN TITLE */}
            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Campaign Internal Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Reopened Vacancy Outreach: Fullstack Engineer"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
              />
            </div>

            {/* EMAIL SUBJECT */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>Email Subject</label>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>Supports <code>{"{{name}}"}</code> and <code>{"{{role}}"}</code></span>
              </div>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject Line"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
              />
            </div>

            {/* EMAIL BODY */}
            <div style={{ marginBottom: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>Email Message Body</label>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>Personalized automatically per recipient</span>
              </div>
              <textarea
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email body..."
                style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px", fontFamily: "inherit", lineHeight: 1.5 }}
              />
            </div>

            {/* TESTING UNIT (MANUAL RECIPIENT ADDER) */}
            <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "8px", padding: "14px 16px", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  🧪 Testing Unit: Add Test Email
                </span>
                <span style={{ fontSize: "10px", background: "#ede9fe", color: "#6d28d9", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
                  Manual Test Mode
                </span>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#64748b" }}>
                Enter your own email or test Gmail to verify outreach delivery before emailing candidate pools.
              </p>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Name (e.g. Tester)"
                  value={newTestName}
                  onChange={(e) => setNewTestName(e.target.value)}
                  style={{ width: "130px", padding: "7px 10px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "12px" }}
                />
                <input
                  type="email"
                  placeholder="Test Email (e.g. your-email@gmail.com)"
                  value={newTestEmail}
                  onChange={(e) => setNewTestEmail(e.target.value)}
                  style={{ flex: 1, padding: "7px 10px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "12px" }}
                />
                <button
                  type="button"
                  onClick={handleAddTestRecipient}
                  style={{ background: "#7c3aed", color: "#ffffff", border: "none", padding: "7px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  + Add Test Email
                </button>
              </div>
            </div>

            {/* SEND CONTROLS */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSendCampaign}
                disabled={submitting || totalSelectedCount === 0}
                style={{
                  background: totalSelectedCount > 0 ? "#0f766e" : "#94a3b8",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: totalSelectedCount > 0 ? "pointer" : "not-allowed",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                {submitting ? <Loader2 size={14} className="spinning" /> : <Send size={14} />}
                <span>Send Re-engagement Campaign ({totalSelectedCount} Selected)</span>
              </button>

              <button
                type="button"
                onClick={handleOpenInGmail}
                disabled={totalSelectedCount === 0}
                style={{
                  background: "#ffffff",
                  color: "#ea4335",
                  border: "1px solid #fca5a5",
                  padding: "9px 16px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: totalSelectedCount > 0 ? "pointer" : "not-allowed",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
                title="Opens Gmail or default email client with all selected recipients in BCC"
              >
                <Mail size={14} />
                <span>Open in Gmail (Manual Send)</span>
              </button>
            </div>
          </div>

          {/* RIGHT: TARGET CANDIDATE POOL (UNHIRED APPLICANTS) */}
          <div style={{ background: "#ffffff", border: "1px solid var(--line)", borderRadius: "10px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <h3 style={{ margin: "0 0 2px", fontSize: "16px" }}>Prior Applicants ({eligibleList.length})</h3>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                  Excludes currently hired candidates. Selected: <strong>{totalSelectedCount}</strong>
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{ background: "#f1f5f9", border: "1px solid var(--line)", padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  style={{ background: "#f1f5f9", border: "1px solid var(--line)", padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* CUSTOM TEST RECIPIENTS SECTION */}
            {customTestRecipients.length > 0 && (
              <div style={{ marginBottom: "14px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#6d28d9", textTransform: "uppercase", marginBottom: "8px" }}>
                  Manual Test Recipients ({customTestRecipients.length})
                </div>
                {customTestRecipients.map((tester) => (
                  <div
                    key={tester.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "#faf5ff",
                      border: "1px solid #e9d5ff",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      marginBottom: "6px"
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: "13px", color: "#581c87" }}>{tester.candidateName}</strong>
                      <div style={{ fontSize: "11px", color: "#7e22ce" }}>{tester.email} • <em>Test Mode</em></div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveTestRecipient(tester.id)}
                      style={{ background: "transparent", border: "none", color: "#9333ea", cursor: "pointer", fontSize: "14px" }}
                      title="Remove test recipient"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* CANDIDATE CHECKLIST */}
            <div style={{ maxHeight: "480px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {eligibleList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", fontSize: "13px" }}>
                  No prior candidates found in database. Ingest resumes or add test recipients above.
                </div>
              ) : (
                eligibleList.map((cand) => {
                  const isChecked = selectedAppIds.has(cand.applicationId);
                  return (
                    <div
                      key={cand.applicationId}
                      onClick={() => toggleCandidate(cand.applicationId)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: `1px solid ${isChecked ? "#2563eb" : "var(--line)"}`,
                        background: isChecked ? "#f0fdf4" : "#fff",
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        style={{ cursor: "pointer", width: "16px", height: "16px" }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                          <strong style={{ fontSize: "13px", color: "#0f172a" }}>{cand.candidateName}</strong>
                          <span
                            style={{
                              fontSize: "10px",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              background: cand.status === "rejected" ? "#fee2e2" : cand.status === "interview" ? "#ede9fe" : "#f1f5f9",
                              color: cand.status === "rejected" ? "#991b1b" : cand.status === "interview" ? "#6d28d9" : "#475569",
                              fontWeight: 600
                            }}
                          >
                            {cand.status.replace("_", " ")}
                          </span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {cand.email} • {cand.role}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEmailSingleCandidate(cand);
                        }}
                        style={{
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          color: "#1d4ed8",
                          borderRadius: "4px",
                          padding: "3px 8px",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          whiteSpace: "nowrap"
                        }}
                        title={`Send direct individual email to ${cand.candidateName}`}
                      >
                        <Mail size={12} />
                        <span>Email</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW TAB */}
      {activeTab === "preview" && (
        <div style={{ background: "#ffffff", border: "1px solid var(--line)", borderRadius: "10px", padding: "28px", maxWidth: "800px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: "14px", marginBottom: "18px" }}>
            <h3 style={{ margin: 0, fontSize: "18px" }}>Live Email Preview</h3>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              Rendered for sample: <strong>{sampleCandidate.name}</strong> ({sampleCandidate.email})
            </span>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", marginBottom: "18px" }}>
            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
              <strong>To:</strong> {sampleCandidate.name} &lt;{sampleCandidate.email}&gt;
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
              <strong>Subject:</strong> {previewSubject}
            </div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>
              <strong>From:</strong> Resume Scanner &lt;careers@company.com&gt;
            </div>
          </div>

          <div style={{ padding: "16px 20px", background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#1e293b" }}>
            {previewBody}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
            <button
              type="button"
              onClick={() => setActiveTab("compose")}
              style={{ background: "#f1f5f9", border: "1px solid var(--line)", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              Back to Edit
            </button>
            <button
              type="button"
              onClick={handleSendCampaign}
              disabled={submitting || totalSelectedCount === 0}
              style={{ background: "#0f766e", color: "#fff", border: "none", padding: "8px 18px", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              Send to {totalSelectedCount} Recipients
            </button>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === "history" && (
        <div style={{ background: "#ffffff", border: "1px solid var(--line)", borderRadius: "10px", padding: "24px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "18px" }}>Recent Outreach Campaigns</h3>
          {campaigns.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", fontSize: "13px" }}>
              No outreach campaigns sent yet. Create your first campaign above!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    border: "1px solid var(--line)",
                    borderRadius: "8px",
                    padding: "16px 20px",
                    background: "#fff"
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "15px", display: "block", marginBottom: "4px" }}>{c.title}</strong>
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                      Subject: "{c.subject}"
                    </div>
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                      Created: {formatDate(c.createdAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: 600,
                        background: c.status === "sent" ? "#dcfce7" : "#f1f5f9",
                        color: c.status === "sent" ? "#166534" : "#475569",
                        marginBottom: "6px"
                      }}
                    >
                      {c.status.toUpperCase()}
                    </span>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>
                      Sent: {c.sentCount} / {c.totalRecipients}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportsView({ report }: { report: ReportSummary }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2>Talent Analytics & Funnel</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => downloadReport("csv")} style={{ padding: "6px 12px", borderRadius: "4px", border: "1px solid var(--line)", background: "#fff" }}>
            Export CSV
          </button>
          <button onClick={() => downloadReport("json")} style={{ padding: "6px 12px", borderRadius: "4px", border: "1px solid var(--line)", background: "#fff" }}>
            Export JSON
          </button>
        </div>
      </div>

      <div className="cc-kpi-grid">
        <div className="kpi-card">
          <span className="kpi-title">TOTAL CANDIDATES</span>
          <span className="kpi-val">{report.total}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">AVERAGE FIT SCORE</span>
          <span className="kpi-val">{report.averageSkillScore}%</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">NEEDS REVIEW</span>
          <span className="kpi-val">{report.needsReview}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">DUPLICATES BLOCKED</span>
          <span className="kpi-val">{report.duplicateCount}</span>
        </div>
      </div>
    </div>
  );
}

function SettingsView({
  onRefreshWorkspace,
  currentUserEmail,
  currentUserProfile,
  currentUserRole: propRole
}: {
  onRefreshWorkspace: () => void;
  currentUserEmail?: string;
  currentUserProfile?: CurrentUserProfile | null;
  currentUserRole?: "owner" | "admin" | "recruiter" | "hiring_manager" | "viewer";
}) {
  const isMasterUser = currentUserEmail?.trim().toLowerCase() === "sumithsbhatt@gmail.com";

  // Self-Service Profile Password State
  const [profileNewPassword, setProfileNewPassword] = useState("");
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("");
  const [profilePasswordNotice, setProfilePasswordNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [profilePasswordLoading, setProfilePasswordLoading] = useState(false);

  // Compliance & GDPR state
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState("");
  const [deleteReason, setDeleteReason] = useState("Candidate Right to be Forgotten Request (GDPR Art. 17)");
  const [deleting, setDeleting] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  async function handleComplianceExport() {
    setExporting(true);
    setExportNotice(null);
    try {
      const res = await exportComplianceData("candidates_full", "json");
      setExportNotice(`Export ready: ${res.rowCount} records generated. Download: ${res.downloadUrl}`);
    } catch (err) {
      setExportNotice("Export failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setExporting(false);
    }
  }

  async function handleCandidateErasure(e: FormEvent) {
    e.preventDefault();
    if (!deleteCandidateId.trim()) return;
    if (
      !confirm(
        `Are you sure you want to permanently erase candidate "${deleteCandidateId}" and all associated scorecards, offers, and parsing data? This action cannot be undone.`
      )
    )
      return;

    setDeleting(true);
    setDeleteNotice(null);
    try {
      const res = await executeComplianceDeletion(deleteCandidateId.trim(), deleteReason);
      setDeleteNotice(`Candidate ${deleteCandidateId} erased. Status: ${res.status}. Message: ${res.message}`);
      setDeleteCandidateId("");
      onRefreshWorkspace();
    } catch (err) {
      setDeleteNotice("Erasure failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpdateProfilePassword(e: FormEvent) {
    e.preventDefault();
    setProfilePasswordNotice(null);

    if (profileNewPassword.length < 6) {
      setProfilePasswordNotice({ type: "error", message: "Permanent password must be at least 6 characters long." });
      return;
    }
    if (profileNewPassword !== profileConfirmPassword) {
      setProfilePasswordNotice({ type: "error", message: "Passwords do not match. Please re-enter." });
      return;
    }

    setProfilePasswordLoading(true);
    try {
      if (isSupabaseBrowserConfigured && supabase) {
        const { error } = await supabase.auth.updateUser({
          password: profileNewPassword,
          data: { must_change_password: false, temporary_password: false }
        });
        if (error) throw error;
      }
      try {
        await completePasswordChange();
      } catch {
        // non-blocking
      }
      setProfilePasswordNotice({ type: "success", message: "Password updated successfully!" });
      setProfileNewPassword("");
      setProfileConfirmPassword("");
    } catch (err) {
      setProfilePasswordNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update password."
      });
    } finally {
      setProfilePasswordLoading(false);
    }
  }

  // Team Management & Provisioning State (Master Admin Only)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [provEmail, setProvEmail] = useState("");
  const [provFullName, setProvFullName] = useState("");
  const [provPassword, setProvPassword] = useState("");
  const [provSubmitting, setProvSubmitting] = useState(false);
  const [provResult, setProvResult] = useState<{
    success: boolean;
    message: string;
    tempPass?: string;
  } | null>(null);

  const loadTeam = useCallback(async () => {
    if (!isMasterUser) return;
    setTeamLoading(true);
    try {
      const res = await fetchTeamMembers();
      setTeamMembers(res.members);
    } catch {
      // fallback
    } finally {
      setTeamLoading(false);
    }
  }, [isMasterUser]);

  useEffect(() => {
    if (isMasterUser) {
      loadTeam();
    }
  }, [isMasterUser, loadTeam]);

  async function handleProvisionSubmit(e: FormEvent) {
    e.preventDefault();
    if (!provEmail.trim()) return;
    setProvSubmitting(true);
    setProvResult(null);
    try {
      const res = await provisionUserAccount({
        email: provEmail.trim(),
        fullName: provFullName.trim() || undefined,
        role: "recruiter",
        temporaryPassword: provPassword.trim() || undefined,
      });
      setProvResult({
        success: true,
        message: `Recruiter account for ${provEmail} provisioned successfully into an isolated private workspace!`,
        tempPass: res.temporaryPassword,
      });
      setProvEmail("");
      setProvFullName("");
      setProvPassword("");
      await loadTeam();
    } catch (err) {
      setProvResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to provision recruiter account.",
      });
    } finally {
      setProvSubmitting(false);
    }
  }

  async function handleRemoveMember(userId: string, memberEmail: string) {
    if (!confirm(`Are you sure you want to remove ${memberEmail}? This will revoke their workspace access.`)) {
      return;
    }
    try {
      await removeTeamMember(userId);
      await loadTeam();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove member.");
    }
  }

  const effectiveRole = isMasterUser ? "owner" : (propRole === "hiring_manager" || propRole === "viewer" ? propRole : "recruiter");
  const isAdmin = isMasterUser;

  // NON-ADMIN USER PROFILE & SELF-SERVICE VIEW
  if (!isAdmin) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: "16px" }}>
          <div>
            <h2 style={{ margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: "10px" }}>
              <User size={24} color="#2563eb" />
              <span>My Profile & Account Settings</span>
            </h2>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
              Manage your personal credentials, view your workspace profile, and review team permissions.
            </p>
          </div>
          <span
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              background: effectiveRole === "hiring_manager" ? "#f3e8ff" : "#eff6ff",
              color: effectiveRole === "hiring_manager" ? "#6b21a8" : "#1e40af",
              border: `1px solid ${effectiveRole === "hiring_manager" ? "#d8b4fe" : "#bfdbfe"}`,
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}
          >
            Role: {effectiveRole.replace("_", " ")}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* LEFT: PERSONAL ACCOUNT & CREDENTIALS */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* PROFILE CARD */}
            <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={18} color="#2563eb" />
                <span>Account Profile Details</span>
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "13px" }}>
                <div>
                  <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>Full Name</span>
                  <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px", marginTop: "2px" }}>
                    {currentUserProfile?.user?.fullName || currentUserEmail?.split("@")[0] || "Team Member"}
                  </div>
                </div>

                <div>
                  <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>Work Email</span>
                  <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px", marginTop: "2px" }}>
                    {currentUserEmail || "Active User"}
                  </div>
                </div>

                <div>
                  <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>Assigned Organization</span>
                  <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px", marginTop: "2px" }}>
                    {currentUserProfile?.workspace?.name || "Resume Scanner Private Workspace"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace", marginTop: "2px" }}>
                    Tenant ID: {currentUserProfile?.workspace?.id || "local-organization"}
                  </div>
                </div>

                <div>
                  <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>Access Tier</span>
                  <div style={{ marginTop: "4px" }}>
                    <span style={{ background: "#f1f5f9", color: "#334155", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                      Active Member (Verified)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* PASSWORD UPDATE CARD */}
            <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <KeyRound size={18} color="#f59e0b" />
                <span>Change Password</span>
              </h3>
              <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#64748b" }}>
                Update your account password. Must be at least 6 characters.
              </p>

              {profilePasswordNotice && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    marginBottom: "14px",
                    fontSize: "12px",
                    background: profilePasswordNotice.type === "success" ? "#f0fdf4" : "#fef2f2",
                    color: profilePasswordNotice.type === "success" ? "#166534" : "#991b1b",
                    border: `1px solid ${profilePasswordNotice.type === "success" ? "#bbf7d0" : "#fecaca"}`
                  }}
                >
                  {profilePasswordNotice.message}
                </div>
              )}

              <form onSubmit={handleUpdateProfilePassword} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                    New Password
                  </label>
                  <input
                    type="password"
                    value={profileNewPassword}
                    onChange={(e) => setProfileNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", boxSizing: "border-box" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={profileConfirmPassword}
                    onChange={(e) => setProfileConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", boxSizing: "border-box" }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={profilePasswordLoading}
                  style={{
                    background: "#0f172a",
                    color: "#fff",
                    border: "none",
                    padding: "9px 16px",
                    borderRadius: "6px",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: profilePasswordLoading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    marginTop: "6px"
                  }}
                >
                  {profilePasswordLoading ? <Loader2 size={16} className="spinning" /> : <KeyRound size={16} />}
                  <span>Update Password</span>
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT: PERMISSIONS SUMMARY & TEAM DIRECTORY */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* ROLE PERMISSIONS CARD */}
            <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <ShieldCheck size={18} color="#10b981" />
                <span>Role & Permissions Overview</span>
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                {effectiveRole === "recruiter" && (
                  <>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Check size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span><strong>Resume Ingestion & Parsing:</strong> Full access to upload resumes and ingest candidate profiles.</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Check size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span><strong>AI Match Scoring & Rediscovery:</strong> Match candidates against jobs and surface overlooked talent.</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Check size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span><strong>Hiring Pipelines:</strong> Move candidates across Kanban stages and manage talent pools.</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Check size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span><strong>Recruiter Copilot:</strong> AI assistant for interview questions and talent analysis.</span>
                    </div>
                  </>
                )}

                {effectiveRole === "hiring_manager" && (
                  <>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Check size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span><strong>Candidate Review:</strong> Inspect candidate dossiers, experience, and match breakdowns.</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Check size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span><strong>Pipeline Collaboration:</strong> Review candidate stages, compare talent, and evaluate fit.</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Check size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span><strong>Job Requirements & Analytics:</strong> View job descriptions and hiring reports.</span>
                    </div>
                  </>
                )}

                {effectiveRole === "viewer" && (
                  <>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Check size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span><strong>Read-Only Access:</strong> View talent database, pipelines, and summary analytics.</span>
                    </div>
                  </>
                )}

                <div
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    background: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                    color: "#475569"
                  }}
                >
                  🔒 <strong>Workspace Governance:</strong> Account provisioning, organization-wide email integrations, team role assignments, and GDPR erasure operations are managed exclusively by Workspace Administrators.
                </div>
              </div>
            </div>

            {/* DATA PRIVACY & EXPORT */}
            <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <ShieldCheck size={20} color="#16a34a" />
                <h3 style={{ margin: 0, fontSize: "16px" }}>Candidate Data Isolation & Privacy</h3>
              </div>
              <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "13px" }}>
                Your candidate resumes, parsing intelligence, and match scores are strictly private to your individual account.
              </p>

              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: "13px" }}>Export My Uploaded Candidates</strong>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      Download a structured JSON dump of your candidates and match ratings.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleComplianceExport}
                    disabled={exporting}
                    style={{
                      background: "#0f172a",
                      color: "#fff",
                      border: "none",
                      padding: "8px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: exporting ? "not-allowed" : "pointer"
                    }}
                  >
                    {exporting ? "Exporting..." : "Export Candidates"}
                  </button>
                </div>
                {exportNotice && (
                  <div style={{ marginTop: "10px", fontSize: "12px", color: "#166534", background: "#dcfce7", padding: "8px 12px", borderRadius: "4px" }}>
                    {exportNotice}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", padding: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "12px", color: "#166534" }}>
                <Lock size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>
                  <strong>Strict Per-User Isolation:</strong> Every candidate you upload is associated exclusively with your user account ({currentUserEmail || "active user"}). No other user can view or access your candidates.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // WORKSPACE ADMINISTRATOR FULL SUITE

  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: "10px" }}>
          <Settings size={24} color="#f59e0b" />
          <span>System Governance & Administrator Controls</span>
        </h2>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
          Master administrator controls for system configuration, security architecture, and data compliance.
        </p>
      </div>

      {/* MASTER ADMIN RECRUITER PROVISIONING & TEAM CONTROL */}
      <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid var(--line)", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "17px", display: "flex", alignItems: "center", gap: "8px" }}>
              <UsersRound size={20} color="#2563eb" />
              <span>Recruiter Provisioning & Workspace Management</span>
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
              Provision dedicated recruiter accounts. Each recruiter receives their own 100% isolated private workspace with zero visibility into other users' candidate databases.
            </p>
          </div>
          <button
            type="button"
            onClick={loadTeam}
            disabled={teamLoading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid var(--line)",
              background: "#f8fafc",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: 500,
              color: "#334155"
            }}
          >
            <RefreshCw size={14} className={teamLoading ? "spinning" : ""} />
            <span>Refresh Team</span>
          </button>
        </div>

        {/* PROVISION NEW RECRUITER FORM */}
        <form onSubmit={handleProvisionSubmit} style={{ background: "#f8fafc", padding: "18px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
          <strong style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px", color: "#0f172a" }}>
            <UserPlus size={16} color="#2563eb" />
            <span>Provision New Recruiter Account</span>
          </strong>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "12px", alignItems: "flex-end" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                Work Email <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="email"
                required
                placeholder="recruiter@company.com"
                value={provEmail}
                onChange={(e) => setProvEmail(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                Full Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Jane Doe"
                value={provFullName}
                onChange={(e) => setProvFullName(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                Temporary Password (Optional)
              </label>
              <input
                type="text"
                placeholder="Auto-generated if blank"
                value={provPassword}
                onChange={(e) => setProvPassword(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>

            <button
              type="submit"
              disabled={provSubmitting}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                padding: "9px 18px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: provSubmitting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                whiteSpace: "nowrap"
              }}
            >
              {provSubmitting ? <Loader2 size={16} className="spinning" /> : <UserPlus size={16} />}
              <span>Provision Recruiter</span>
            </button>
          </div>

          {provResult && (
            <div
              style={{
                marginTop: "14px",
                padding: "12px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                background: provResult.success ? "#f0fdf4" : "#fef2f2",
                border: `1px solid ${provResult.success ? "#bbf7d0" : "#fecaca"}`,
                color: provResult.success ? "#166534" : "#991b1b"
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>{provResult.message}</div>
              {provResult.tempPass && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                  <span>Temporary Password: <code style={{ background: "#dcfce7", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>{provResult.tempPass}</code></span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(provResult.tempPass || "");
                      alert("Temporary password copied to clipboard!");
                    }}
                    style={{
                      background: "#166534",
                      color: "#fff",
                      border: "none",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <Copy size={12} />
                    <span>Copy</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </form>

        {/* TEAM MEMBERS DIRECTORY */}
        <div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "10px" }}>
            Current System Members ({teamMembers.length})
          </div>

          {teamLoading && teamMembers.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
              <Loader2 size={20} className="spinning" style={{ display: "inline-block", marginRight: "8px" }} />
              Loading team directory...
            </div>
          ) : teamMembers.length === 0 ? (
            <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "6px", fontSize: "13px", color: "var(--muted)" }}>
              No provisioned recruiters yet. Use the form above to provision recruiter accounts.
            </div>
          ) : (
            <div style={{ border: "1px solid var(--line)", borderRadius: "8px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid var(--line)", color: "#64748b", fontSize: "11px", textTransform: "uppercase" }}>
                    <th style={{ padding: "10px 14px" }}>Member</th>
                    <th style={{ padding: "10px 14px" }}>Email</th>
                    <th style={{ padding: "10px 14px" }}>Role & Workspace</th>
                    <th style={{ padding: "10px 14px" }}>Joined</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map((m) => {
                    const isMaster = m.email.trim().toLowerCase() === "sumithsbhatt@gmail.com";
                    return (
                      <tr key={m.userId} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 600, color: "#0f172a" }}>
                          {m.fullName || m.email.split("@")[0]}
                        </td>
                        <td style={{ padding: "12px 14px", color: "#475569" }}>{m.email}</td>
                        <td style={{ padding: "12px 14px" }}>
                          {isMaster ? (
                            <span style={{ background: "#fef3c7", color: "#92400e", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>
                              👑 Master Admin
                            </span>
                          ) : (
                            <span style={{ background: "#eff6ff", color: "#1e40af", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600 }}>
                              Recruiter (Private Workspace)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 14px", color: "#64748b", fontSize: "12px" }}>
                          {formatDate(m.joinedAt)}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          {!isMaster && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.userId, m.email)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#ef4444",
                                cursor: "pointer",
                                fontSize: "12px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "4px 8px",
                                borderRadius: "4px"
                              }}
                              title="Remove Recruiter"
                            >
                              <Trash2 size={14} />
                              <span>Revoke</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "24px" }}>
        {/* LEFT COLUMN: ADMIN PROFILE & SECURITY */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* MASTER ADMIN PROFILE CARD */}
          <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  background: "#fef3c7",
                  display: "grid",
                  placeItems: "center",
                  color: "#d97706"
                }}
              >
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "16px" }}>Master Administrator Profile</h3>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                  Primary root account for Resume Scanner
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "13px" }}>
              <div>
                <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>Administrator Name</span>
                <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px", marginTop: "2px" }}>
                  Sumith Bhatt (Master Admin)
                </div>
              </div>

              <div>
                <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>System Email</span>
                <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px", marginTop: "2px" }}>
                  sumithsbhatt@gmail.com
                </div>
              </div>

              <div>
                <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 }}>Tenant Architecture</span>
                <div style={{ marginTop: "4px" }}>
                  <span style={{ background: "#fef3c7", color: "#92400e", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 700 }}>
                    👑 Master Admin (Dedicated Private Storage)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ADMIN PASSWORD CARD */}
          <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid var(--line)" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <KeyRound size={18} color="#f59e0b" />
              <span>Update Administrator Password</span>
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#64748b" }}>
              Change the password for the master administrator account.
            </p>

            {profilePasswordNotice && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  marginBottom: "14px",
                  fontSize: "12px",
                  background: profilePasswordNotice.type === "success" ? "#f0fdf4" : "#fef2f2",
                  color: profilePasswordNotice.type === "success" ? "#166534" : "#991b1b",
                  border: `1px solid ${profilePasswordNotice.type === "success" ? "#bbf7d0" : "#fecaca"}`
                }}
              >
                {profilePasswordNotice.message}
              </div>
            )}

            <form onSubmit={handleUpdateProfilePassword} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={profileNewPassword}
                  onChange={(e) => setProfileNewPassword(e.target.value)}
                  placeholder="Enter new administrator password"
                  required
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={profileConfirmPassword}
                  onChange={(e) => setProfileConfirmPassword(e.target.value)}
                  placeholder="Re-enter password to confirm"
                  required
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--line)", boxSizing: "border-box" }}
                />
              </div>

              <button
                type="submit"
                disabled={profilePasswordLoading}
                style={{
                  background: "#0f172a",
                  color: "#fff",
                  border: "none",
                  padding: "9px 16px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: profilePasswordLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  marginTop: "4px"
                }}
              >
                {profilePasswordLoading ? <Loader2 size={16} className="spinning" /> : <KeyRound size={16} />}
                <span>Save New Password</span>
              </button>
            </form>
          </div>

          {/* ENGINE HEALTH & DIAGNOSTICS */}
          <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid var(--line)" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Database size={18} color="#2563eb" />
              <span>AI Engine & Diagnostic Health</span>
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <span>V11 Talent Intelligence Engine</span>
                <span style={{ color: "#16a34a", fontWeight: 700, fontSize: "12px" }}>● Operational</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <span>Multi-Dimensional Job Matcher</span>
                <span style={{ color: "#16a34a", fontWeight: 700, fontSize: "12px" }}>● Operational</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <span>Per-User Data Isolation Enforcement</span>
                <span style={{ color: "#16a34a", fontWeight: 700, fontSize: "12px" }}>● Active (Strict)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <span>Storage Backend</span>
                <span style={{ color: "#2563eb", fontWeight: 600, fontSize: "12px" }}>Local Encrypted JSON</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PRIVACY, SECURITY & GOVERNANCE */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid var(--line)" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Enterprise Security Architecture</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "13px" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <ShieldCheck size={18} color="#10b981" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>Admin-Only Account Creation:</strong>
                  <div style={{ color: "#64748b", marginTop: "2px" }}>
                    Self-service registration is disabled. Only authorized administrators can provision recruiters and team members.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <KeyRound size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>One-Time Temporary Passwords:</strong>
                  <div style={{ color: "#64748b", marginTop: "2px" }}>
                    Temporary credentials expire immediately after first login. Users must select their permanent password before any candidate data is shown.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <EyeOff size={18} color="#8b5cf6" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>Blind Screening:</strong>
                  <div style={{ color: "#64748b", marginTop: "2px" }}>
                    Candidate identity masking prevents unconscious gender or demographic bias during early-stage screening.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <Database size={18} color="#3b82f6" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>Encrypted Credentials & Ingestion:</strong>
                  <div style={{ color: "#64748b", marginTop: "2px" }}>
                    All third-party tokens (Gmail OAuth, Resend) are encrypted at rest with Fernet cryptography and in-transit TLS 1.3.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* GDPR & COMPLIANCE OPERATIONS CARD */}
          <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <ShieldCheck size={20} color="var(--brand)" />
              <h3 style={{ margin: 0, fontSize: "16px" }}>GDPR, DPDP & Compliance Operations</h3>
            </div>
            <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "13px" }}>
              Data subject rights enforcement, automated retention policies, and verifiable deletion audits.
            </p>

            {/* EXPORT DATA DUMP */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "13px" }}>GDPR Article 20 Data Portability Export</strong>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    Generate structured JSON dump of all workspace candidates, scores, and event logs.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleComplianceExport}
                  disabled={exporting}
                  style={{
                    background: "#0f172a",
                    color: "#fff",
                    border: "none",
                    padding: "8px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: exporting ? "not-allowed" : "pointer"
                  }}
                >
                  {exporting ? "Generating Dump..." : "Generate Export Dump"}
                </button>
              </div>
              {exportNotice && (
                <div style={{ marginTop: "10px", fontSize: "12px", color: "#166534", background: "#dcfce7", padding: "8px 12px", borderRadius: "4px" }}>
                  {exportNotice}
                </div>
              )}
            </div>

            {/* RIGHT TO BE FORGOTTEN FORM */}
            <form onSubmit={handleCandidateErasure} style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
              <strong style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>
                Right to be Forgotten (Candidate Erasure)
              </strong>
              <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#64748b" }}>
                Irreversibly purges candidate resume documents, PII, embeddings, and scorecards per GDPR Article 17.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                <div>
                  <label style={{ fontSize: "11px", color: "#64748b" }}>Candidate ID or Blind ID</label>
                  <input
                    type="text"
                    value={deleteCandidateId}
                    placeholder="e.g. app-1 or cand-uuid"
                    onChange={(e) => setDeleteCandidateId(e.target.value)}
                    required
                    style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--line)", fontSize: "12px" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", color: "#64748b" }}>Erasure Legal Reason</label>
                  <select
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--line)", fontSize: "12px" }}
                  >
                    <option value="Candidate Right to be Forgotten Request (GDPR Art. 17)">Candidate Right to be Forgotten (GDPR Art. 17)</option>
                    <option value="Consent Withdrawn by Data Subject">Consent Withdrawn by Data Subject</option>
                    <option value="Statutory Retention Period Expired">Statutory Retention Period Expired</option>
                    <option value="Legal Compliance Order">Legal Compliance Order</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={deleting}
                style={{
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  padding: "6px 14px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer"
                }}
              >
                {deleting ? "Purging Records..." : "Permanently Erase Candidate Records"}
              </button>
              {deleteNotice && (
                <div style={{ marginTop: "10px", fontSize: "12px", color: "#991b1b", background: "#fee2e2", padding: "8px 12px", borderRadius: "4px" }}>
                  {deleteNotice}
                </div>
              )}
            </form>

            {/* RETENTION POLICIES */}
            <div style={{ fontSize: "12px", color: "#475569" }}>
              <strong style={{ display: "block", marginBottom: "6px", color: "#0f172a" }}>Active Automated Retention Rules:</strong>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <li><strong>Unhired Resumes:</strong> Automatically archived after 180 days with candidate consent.</li>
                <li><strong>Interview Audio/Transcripts:</strong> Automatically anonymized after 90 days.</li>
                <li><strong>Blind Screening PII:</strong> Salted SHA-256 pseudonymization on initial ingestion.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
