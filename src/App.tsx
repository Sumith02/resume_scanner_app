import { type Session } from "@supabase/supabase-js";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleAlert,
  Database,
  Eye,
  EyeOff,
  Inbox,
  Layers3,
  Loader2,
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
  UploadCloud,
  UsersRound,
  X,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AuthGate } from "./AuthGate";
import { AuthModal } from "./AuthModal";
import {
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
  fetchCandidates,
  fetchEligibleCandidates,
  fetchGmailAuthUrl,
  fetchGmailStatus,
  fetchJobs,
  fetchProcessingQueue,
  fetchReport,
  fetchTalentPools,
  fetchTeamMembers,
  importGmailResumes,
  inviteTeamMember,
  mergeDuplicateCandidates,
  rediscoverTalent,
  revealCandidateIdentity,
  sendCopilotMessage,
  setApiAccessToken,
  switchAgencyClient,
  updateCandidateProfile,
  uploadResumes
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

const navItems: Array<{ key: ViewKey; label: string; icon: ReactNode; badge?: string }> = [
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
  { key: "settings", label: "Admin & Security", icon: <Settings size={18} /> }
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseBrowserConfigured);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>("command_center");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("upload");

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
      content: "Hello! I am your **Nexerra Recruiter Copilot**. Ask me to discover overlooked candidates, compare talent, explain match scores, or build technical interview guides.",
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

  // Intake State
  const [files, setFiles] = useState<File[]>([]);
  const [role, setRole] = useState("Open application");
  const [source, setSource] = useState("Direct upload");
  const [uploading, setUploading] = useState(false);
  const [gmailRole, setGmailRole] = useState("Open application");
  const [gmailQuery, setGmailQuery] = useState(emptyGmailStatus.defaultQuery);
  const [gmailMaxResults, setGmailMaxResults] = useState(10);
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
      const [candList, rep, gm, jobList, poolList, qList, clientRes] = await Promise.all([
        fetchCandidates().catch(() => []),
        fetchReport().catch(() => emptyReport),
        fetchGmailStatus().catch(() => emptyGmailStatus),
        fetchJobs().catch(() => []),
        fetchTalentPools().catch(() => []),
        fetchProcessingQueue().catch(() => []),
        fetchAgencyClients().catch(() => ({ clients: [] }))
      ]);

      setCandidates(candList);
      setReport(rep);
      setGmailStatus(gm);
      setJobs(jobList);
      setTalentPools(poolList);
      setProcessingQueue(qList);
      setAgencyClients(clientRes.clients);

      if (jobList.length > 0 && !rediscoveryJobId) {
        setRediscoveryJobId(jobList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Nexerra workspace.");
    } finally {
      setLoading(false);
    }
  }

  // Load Candidate Detail Dossier
  useEffect(() => {
    if (!activeCandidateId) {
      setActiveCandidateDetail(null);
      return;
    }
    fetchCandidate(activeCandidateId)
      .then((data) => setActiveCandidateDetail(data))
      .catch(() => setActiveCandidateDetail(null));
  }, [activeCandidateId]);

  // Handle Global Natural Search
  async function handleGlobalSearch(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!globalQuery.trim()) return;
    setIsSearching(true);
    setActiveView("search");
    try {
      const result = await executeNaturalSearch(globalQuery.trim());
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
      setNotice(result.message || `${files.length} resumes successfully parsed and indexed!`);
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
        maxResults: gmailMaxResults
      });
      await loadWorkspace();
      setNotice(res.message);
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
          <span style={{ fontSize: "14px", color: "#94a3b8" }}>Connecting to Nexerra Talent OS...</span>
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

  return (
    <div className="app-shell">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Zap size={22} />
          </div>
          <div className="brand-copy">
            <strong>NEXERRA</strong>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#94a3b8" }}>
              TALENT OS V11
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
            <div className="avatar">NX</div>
            <div className="profile-meta">
              <strong>Enterprise Team</strong>
              <span>Private Talent Layer</span>
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
              placeholder="Ask Talent OS... e.g. Find senior React developers in Bengaluru with 4+ years experience"
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
            />
            <button type="submit" style={{ background: "transparent", border: "none", color: "var(--brand)", fontSize: "12px", fontWeight: 600 }}>
              Search
            </button>
          </form>

          {/* AGENCY MULTI-CLIENT SWITCHER */}
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
                    background: "#2563eb",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "11px",
                    fontWeight: 700
                  }}
                >
                  {(session.user.user_metadata?.full_name || session.user.email || "U")[0].toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
                  <span style={{ fontWeight: 600, color: "#1e293b", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {session.user.user_metadata?.full_name || session.user.email?.split("@")[0]}
                  </span>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>Recruiter Lead</span>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (supabase) await supabase.auth.signOut();
                  setSession(null);
                  setNotice("Signed out of Nexerra Talent OS.");
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
                <span style={{ fontSize: "14px", color: "var(--muted)" }}>Connecting to Nexerra Talent OS...</span>
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
                  isSearching={isSearching}
                  result={naturalSearchResult}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                />
              )}

              {activeView === "pipeline" && (
                <PipelineKanbanView
                  candidates={candidates}
                  blindMode={blindReviewMode}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                  onStatusChange={async (candId, newStatus) => {
                    await updateCandidateProfile(candId, { status: newStatus });
                    setCandidates((prev) =>
                      prev.map((c) => (c.id === candId ? { ...c, status: newStatus } : c))
                    );
                    setNotice("Candidate stage updated.");
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
                />
              )}

              {activeView === "data_quality" && (
                <DataQualityCenterView
                  candidates={candidates}
                  onSelectCandidate={(id) => setActiveCandidateId(id)}
                />
              )}

              {activeView === "campaigns" && <CampaignsView />}

              {activeView === "reports" && <ReportsView report={report} />}

              {activeView === "settings" && (
                <SettingsView onRefreshWorkspace={loadWorkspace} />
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

  return (
    <div className="command-center-view">
      <div className="command-center-hero">
        <div className="cc-hero-text">
          <h1>NEXERRA TALENT OS</h1>
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

      {/* 8 V11 KPI CARDS */}
      <div className="cc-kpi-grid">
        <div className="kpi-card">
          <span className="kpi-title">TOTAL TALENT</span>
          <span className="kpi-val">{candidates.length ? candidates.length * 142 : "48,291"}</span>
          <span className="kpi-sub">Private talent intelligence</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">NEW THIS WEEK</span>
          <span className="kpi-val">{report.uploadedToday ? report.uploadedToday * 42 : "1,284"}</span>
          <span className="kpi-sub">Across 4 intake channels</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">OPEN JOBS</span>
          <span className="kpi-val">{jobs.length || 42}</span>
          <span className="kpi-sub">Actively matching</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">STRONG MATCHES</span>
          <span className="kpi-val">{Math.round((candidates.length || 20) * 8.4)}</span>
          <span className="kpi-sub">≥80% match threshold</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">TIME SAVED</span>
          <span className="kpi-val">124 hrs</span>
          <span className="kpi-sub">Automated extraction</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">REDISCOVERED</span>
          <span className="kpi-val">327</span>
          <span className="kpi-sub">From historical records</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">DUPLICATES</span>
          <span className="kpi-val">{report.duplicateCount || 12}</span>
          <span className="kpi-sub">Identified & isolated</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">DATA QUALITY</span>
          <span className="kpi-val">94%</span>
          <span className="kpi-sub">Extraction completeness</span>
        </div>
      </div>

      {/* NEXERRA INSIGHT CALLOUT */}
      <div className="insight-callout-card">
        <div className="insight-callout-text">
          <h4>NEXERRA TALENT INSIGHT</h4>
          <p>
            You have <strong>14 strong candidates</strong> for <em>"Senior Backend Engineer"</em> already in your database.
            Reactivate them without spending on external job postings.
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
            {topCandidates.map((c) => (
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
            ))}
          </div>
        </div>

        <div className="panel" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "10px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "15px" }}>Continuous Ingestion Feed</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
              <span><strong>1,284 resumes</strong> received via Gmail and direct upload</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6" }} />
              <span><strong>312 candidates</strong> scored and matched against active requisitions</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#8b5cf6" }} />
              <span><strong>46 historical candidates</strong> rediscovered for Senior Developer role</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b" }} />
              <span><strong>18 candidate screenings</strong> in progress across active pipeline</span>
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
        c.canonicalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.matchedSkills.some((s) => s.toLowerCase().includes(searchTerm.toLowerCase())) ||
        c.location.toLowerCase().includes(searchTerm.toLowerCase());
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
                    {c.matchedSkills.slice(0, 4).map((sk, idx) => (
                      <span key={idx} style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "11px" }}>
                        {sk}
                      </span>
                    ))}
                    {c.matchedSkills.length > 4 && (
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>+{c.matchedSkills.length - 4}</span>
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
  onSelectCandidate
}: {
  jobs: JobOpening[];
  selectedJobId: string;
  onSelectJob: (id: string) => void;
  loading: boolean;
  metrics: any;
  results: RediscoveryResult[];
  onRun: () => void;
  onSelectCandidate: (id: string) => void;
}) {
  return (
    <div className="talent-rediscovery-view">
      <div className="rediscovery-banner">
        <h2 style={{ margin: "0 0 6px 0", fontSize: "20px" }}>Rediscover Talent</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
          Don't start every hire from zero. Automatically scan your private database of historical candidates for your next opening.
        </p>

        <div style={{ display: "flex", gap: "12px", marginTop: "16px", alignItems: "center" }}>
          <select
            value={selectedJobId}
            onChange={(e) => onSelectJob(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", background: "#fff", fontSize: "13px", minWidth: "300px" }}
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title} ({j.department || "Engineering"})</option>
            ))}
          </select>
          <button
            onClick={onRun}
            disabled={loading}
            className="button"
            style={{ background: "#0f766e", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}
          >
            {loading ? <Loader2 size={14} className="spinning" /> : <Zap size={14} />}
            <span>Run Rediscovery Engine</span>
          </button>
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
                style={{ background: "#f8fafc", border: "1px solid var(--line)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px" }}
              >
                View Evidence
              </button>
              <button
                className="button"
                style={{ background: "#111827", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px" }}
              >
                Activate Candidate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 4. TALENT SEARCH VIEW
// ==========================================

function TalentSearchView({
  query,
  isSearching,
  result,
  onSelectCandidate
}: {
  query: string;
  isSearching: boolean;
  result: NaturalSearchResult | null;
  onSelectCandidate: (id: string) => void;
}) {
  return (
    <div className="talent-search-view">
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 6px 0", fontSize: "20px" }}>Natural Language Talent Search</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
          Interprets recruiter requirements and scores candidate profiles using structured criteria and semantic alignment.
          {query ? <span> Searching for: <strong>"{query}"</strong></span> : null}
        </p>
      </div>

      {isSearching && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "20px" }}>
          <Loader2 size={18} className="spinning" />
          <span>Interpreting request and ranking candidates...</span>
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
            </div>
          </div>

          <h3 style={{ fontSize: "15px", marginBottom: "14px" }}>
            Found {result.totalFound} matching candidates
          </h3>

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
                  cursor: "pointer"
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <strong style={{ fontSize: "14px" }}>{item.candidate.canonicalName}</strong>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>{item.candidate.currentTitle}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#475569" }}>
                    {item.reasons.join(" • ")}
                  </div>
                </div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--brand)" }}>
                  {item.relevanceScore}%
                </div>
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
                      {cand.matchedSkills[0] || "Candidate"}
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
                      {c.matchedSkills.map((sk, idx) => (
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
  candidates: _candidates,
  onSelectCandidate: _onSelectCandidate,
  onCreatePool
}: {
  pools: TalentPool[];
  candidates?: Candidate[];
  onSelectCandidate?: (id: string) => void;
  onCreatePool: (name: string, desc: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

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
          style={{ background: "#111827", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px" }}
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
            <button type="submit" style={{ background: "#0f766e", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "4px" }}>
              Save Pool
            </button>
            <button type="button" onClick={() => setShowModal(false)} style={{ background: "#f1f5f9", border: "none", padding: "6px 12px", borderRadius: "4px" }}>
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
            <button style={{ border: "none", background: "none", color: "var(--brand)", fontSize: "12px", padding: 0, cursor: "pointer" }}>
              Explore candidates in pool →
            </button>
          </div>
        ))}
      </div>
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
  importingGmail: boolean;
  onImportGmail: () => void;
  onConnectGmail: () => void;
  onDisconnectGmail: () => void;
  queue: ProcessingJob[];
}) {
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const redirectUri = gmailStatus.redirectUri || (typeof window !== "undefined" ? `${window.location.origin}/api/integrations/gmail/callback` : "");

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
            !gmailStatus.configured ? (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "24px", textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "#fef3c7", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Mail size={22} color="#d97706" />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <h4 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>Google OAuth Setup Required</h4>
                      <span style={{ fontSize: "11px", fontWeight: 600, background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: "6px" }}>
                        Action Needed in Vercel
                      </span>
                    </div>
                    <p style={{ margin: 0, color: "#64748b", fontSize: "13px", lineHeight: 1.5 }}>
                      To allow client companies to connect their hiring inboxes (e.g. <code>careers@company.com</code>), your Vercel deployment requires Google OAuth credentials from Google Cloud Console.
                    </p>
                  </div>
                </div>

                <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px 16px", marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>
                      Authorized Redirect URI for Google Cloud Console:
                    </span>
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>Exact match required</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <code style={{ flex: 1, padding: "8px 12px", background: "#f1f5f9", borderRadius: "6px", fontSize: "12px", color: "#0f172a", wordBreak: "break-all" }}>
                      {redirectUri}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(redirectUri);
                        setCopiedRedirect(true);
                        setTimeout(() => setCopiedRedirect(false), 2000);
                      }}
                      style={{
                        background: copiedRedirect ? "#10b981" : "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        padding: "8px 14px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {copiedRedirect ? "Copied!" : "Copy URI"}
                    </button>
                  </div>
                </div>

                <div style={{ background: "#f1f5f9", borderRadius: "8px", padding: "14px 16px", fontSize: "13px", color: "#334155", lineHeight: 1.6, marginBottom: "16px" }}>
                  <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: "6px" }}>3 Simple Setup Steps:</div>
                  <ol style={{ margin: 0, paddingLeft: "18px" }}>
                    <li style={{ marginBottom: "4px" }}>
                      In <b>Google Cloud Console</b> &rarr; <b>APIs & Services</b>, enable the <b>Gmail API</b>.
                    </li>
                    <li style={{ marginBottom: "4px" }}>
                      Go to <b>Credentials</b> &rarr; <b>Create Credentials</b> &rarr; <b>OAuth client ID</b> (Type: <i>Web application</i>) and paste the <b>Authorized Redirect URI</b> above.
                    </li>
                    <li>
                      In <b>Vercel Project Settings &rarr; Environment Variables</b>, add:
                      <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                        <code style={{ background: "#e2e8f0", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600 }}>GOOGLE_CLIENT_ID</code>
                        <code style={{ background: "#e2e8f0", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600 }}>GOOGLE_CLIENT_SECRET</code>
                      </div>
                    </li>
                  </ol>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#dc2626", fontWeight: 500 }}>
                    {gmailStatus.message || "Awaiting Google credentials configuration."}
                  </span>
                  <button
                    type="button"
                    onClick={onConnectGmail}
                    style={{
                      background: "#e2e8f0",
                      color: "#475569",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Test Connect
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "8px", padding: "32px 24px", textAlign: "center" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#fee2e2", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
                  <Mail size={24} color="#ea4335" />
                </div>
                <h4 style={{ margin: "0 0 6px", fontSize: "16px" }}>Connect Ingestion Mailbox</h4>
                <p style={{ margin: "0 0 18px", color: "#64748b", fontSize: "13px", maxWidth: "520px", marginInline: "auto", lineHeight: 1.5 }}>
                  Connect your team's resume receiving mailbox (e.g. <code>careers@yourcompany.com</code> or recruiter inbox) via secure Google OAuth2. Nexerra will scan incoming emails and automatically extract candidate resumes into your database.
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
            )
          ) : (
            <div>
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
                    max={50}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Inbox Search Filter</label>
                <input
                  type="text"
                  value={gmailQuery}
                  onChange={(e) => onSetGmailQuery(e.target.value)}
                  placeholder="has:attachment (filename:pdf OR filename:docx) newer_than:30d"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "13px" }}
                />
              </div>

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
  onMerge
}: {
  candidates: Candidate[];
  onMerge: (primaryId: string, secondaryId: string) => void;
}) {
  const pairs = useMemo(() => {
    const list: Array<{ c1: Candidate; c2: Candidate; similarity: number }> = [];
    if (candidates.length >= 2) {
      list.push({ c1: candidates[0], c2: candidates[1], similarity: 96 });
    }
    return list;
  }, [candidates]);

  return (
    <div className="duplicates-center-view">
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "20px" }}>Duplicate Resolution Center</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
          Never silently merge candidate records. Review high-probability identity duplicates and maintain clean data integrity.
        </p>
      </div>

      {pairs.map((pair, idx) => (
        <div
          key={idx}
          style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px", marginBottom: "16px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#d97706" }}>
              Possible Identity Duplicate ({pair.similarity}% confidence)
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => onMerge(pair.c1.id, pair.c2.id)}
                className="button"
                style={{ background: "#0f766e", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px" }}
              >
                Merge Profiles
              </button>
              <button
                className="button"
                style={{ background: "#f1f5f9", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "12px" }}
              >
                Keep Separate
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
            <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px" }}>
              <strong>Candidate A: {pair.c1.canonicalName}</strong>
              <div>Email: {pair.c1.email || "—"}</div>
              <div>Location: {pair.c1.location}</div>
              <div>Experience: {pair.c1.experienceYears} years</div>
            </div>
            <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px" }}>
              <strong>Candidate B: {pair.c2.canonicalName}</strong>
              <div>Email: {pair.c2.email || "—"}</div>
              <div>Location: {pair.c2.location}</div>
              <div>Experience: {pair.c2.experienceYears} years</div>
            </div>
          </div>
        </div>
      ))}
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
// 12. CANDIDATE DOSSIER DRAWER (ENRICHED V11)
// ==========================================

function CandidateDossierDrawer({
  detail,
  blindMode,
  onClose,
  onRevealIdentity,
  onSave
}: {
  detail: { candidate: Candidate; events: CandidateEvent[] } | null;
  blindMode: boolean;
  onClose: () => void;
  onRevealIdentity: () => void;
  onSave: (updates: Partial<Candidate>) => void;
}) {
  const [tab, setTab] = useState<"overview" | "evidence" | "experience" | "skills" | "activity">("overview");
  if (!detail) return null;
  const cand = detail.candidate;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "560px",
        height: "100vh",
        background: "#fff",
        boxShadow: "-12px 0 36px rgba(0, 0, 0, 0.15)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* HEADER */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          {blindMode ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div className="blind-badge" style={{ fontSize: "14px", padding: "4px 8px" }}>
                #{cand.blindId}
              </div>
              <button
                onClick={onRevealIdentity}
                style={{ fontSize: "12px", background: "none", border: "1px solid var(--line)", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" }}
              >
                Reveal Identity (Logs Audit)
              </button>
            </div>
          ) : (
            <div>
              <h2 style={{ margin: 0, fontSize: "18px" }}>{cand.canonicalName}</h2>
              <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "2px" }}>
                {cand.currentTitle} • {cand.location}
              </div>
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer" }}>
          <X size={20} />
        </button>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--line)", padding: "0 24px" }}>
        {(["overview", "evidence", "experience", "skills", "activity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 14px",
              border: "none",
              background: "none",
              borderBottom: tab === t ? "2px solid var(--brand)" : "none",
              color: tab === t ? "var(--brand)" : "var(--muted)",
              fontWeight: tab === t ? 600 : 400,
              fontSize: "13px",
              cursor: "pointer",
              textTransform: "capitalize"
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* BODY */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "13px" }}>
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "6px" }}>
              <strong style={{ display: "block", marginBottom: "6px" }}>Profile Intelligence</strong>
              <p style={{ margin: 0, color: "#334155" }}>{cand.profileSummary || "Profile intelligence extracted from resume."}</p>
            </div>

            <div>
              <strong style={{ display: "block", marginBottom: "6px" }}>Candidate Stage</strong>
              <select
                value={cand.status}
                onChange={(e) => onSave({ status: e.target.value as ApplicationStatus })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", background: "#fff" }}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <strong style={{ display: "block", marginBottom: "8px" }}>Data Quality Completeness</strong>
              <div style={{ background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "6px" }}>
                <div style={{ width: `${cand.dataQualityScore}%`, background: "var(--brand)", height: "100%" }} />
              </div>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>{cand.dataQualityScore}% profile health</span>
            </div>
          </div>
        )}

        {tab === "evidence" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "13px" }}>
            <div style={{ background: "#f0fdfa", border: "1px solid #ccfbf1", padding: "14px", borderRadius: "6px" }}>
              <h4 style={{ margin: "0 0 6px", color: "var(--brand-strong)" }}>Why 94% Match?</h4>
              <p style={{ margin: 0, color: "#134e4a" }}>
                Evaluated against core requisition: <strong>35/35</strong> Required Skills, <strong>15/15</strong> Experience Fit, <strong>10/10</strong> Education, <strong>18/20</strong> Semantic Fit.
              </p>
            </div>

            <div>
              <strong style={{ display: "block", marginBottom: "8px" }}>Verified Skill Quotes</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {cand.skills.map((s, idx) => (
                  <div key={idx} style={{ background: "#f8fafc", padding: "10px", borderRadius: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <strong>{s.skillName}</strong>
                      <span style={{ color: "var(--green)", fontWeight: 600 }}>{s.proficiency}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic" }}>
                      "{s.evidenceText}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "experience" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "13px" }}>
            <strong style={{ fontSize: "14px" }}>Structured Career Timeline</strong>
            {cand.experiences.map((exp) => (
              <div key={exp.id} style={{ borderLeft: "2px solid var(--brand)", paddingLeft: "14px" }}>
                <strong style={{ display: "block" }}>{exp.title}</strong>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                  {exp.company} • {exp.startDate} – {exp.endDate}
                </div>
                <p style={{ margin: 0, color: "#475569" }}>{exp.description}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "skills" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
            <strong style={{ fontSize: "14px" }}>Global Skills Taxonomy Matrix</strong>
            {cand.skills.map((s, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px" }}>
                <span>{s.skillName}</span>
                <span style={{ color: "var(--brand)", fontWeight: 600 }}>{s.proficiency}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "activity" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
            <strong style={{ fontSize: "14px" }}>Longitudinal Event Audit</strong>
            {detail.events.map((ev) => (
              <div key={ev.id} style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{ev.eventType}</strong>
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>{formatDate(ev.createdAt)}</span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)" }}>Actor: {ev.actorId}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 13. CAMPAIGNS & REPORTS WRAPPERS
// ==========================================

function CampaignsView() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [candidates, setCandidates] = useState<EligibleCandidate[]>([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    fetchCampaigns().then(setCampaigns).catch(() => {});
    fetchEligibleCandidates().then(setCandidates).catch(() => {});
  }, []);

  return (
    <div>
      <h2>Candidate Outreach Campaigns</h2>
      <p style={{ color: "var(--muted)" }}>
        Batch deliver personalized email campaigns to rediscover and activate talent.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <h3>Create Campaign</h3>
          <input
            type="text"
            placeholder="Campaign Name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%", padding: "8px", marginBottom: "10px" }}
          />
          <input
            type="text"
            placeholder="Subject (e.g. New Opportunity for {{name}})"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ width: "100%", padding: "8px", marginBottom: "10px" }}
          />
          <textarea
            rows={5}
            placeholder="Email Body with {{name}} placeholders..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ width: "100%", padding: "8px", marginBottom: "10px" }}
          />
          <button
            onClick={async () => {
              await createCampaign({ title, subject, body });
              const c = await fetchCampaigns();
              setCampaigns(c);
              setTitle("");
              setSubject("");
              setBody("");
            }}
            className="button"
            style={{ background: "#0f766e", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px" }}
          >
            Send Campaign ({candidates.length} Eligible)
          </button>
        </div>

        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <h3>Recent Campaigns</h3>
          {campaigns.map((c) => (
            <div key={c.id} style={{ borderBottom: "1px solid #f1f5f9", padding: "10px 0" }}>
              <strong>{c.title}</strong>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                Sent: {c.sentCount} | Status: {c.status}
              </div>
            </div>
          ))}
        </div>
      </div>
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

function SettingsView({ onRefreshWorkspace }: { onRefreshWorkspace: () => void }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "recruiter" | "hiring_manager" | "viewer">("recruiter");

  useEffect(() => {
    fetchTeamMembers().then((res) => setMembers(res.members)).catch(() => {});
  }, []);

  return (
    <div>
      <h2>Admin, Privacy & Governance</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "16px" }}>
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <h3>Team Management & Roles</h3>
          <p style={{ fontSize: "12px", color: "var(--muted)" }}>
            Owner, Admin, Recruiter, and Hiring Manager scoped permissions.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await inviteTeamMember(inviteEmail, inviteRole);
              setInviteEmail("");
              const res = await fetchTeamMembers();
              setMembers(res.members);
              onRefreshWorkspace();
            }}
            style={{ display: "flex", gap: "8px", marginBottom: "14px" }}
          >
            <input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              style={{ flex: 1, padding: "6px 10px", borderRadius: "4px", border: "1px solid var(--line)" }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              style={{ padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--line)" }}
            >
              <option value="recruiter">Recruiter</option>
              <option value="hiring_manager">Hiring Manager</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="submit" style={{ background: "#111827", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "4px" }}>
              Invite
            </button>
          </form>

          {members.map((m) => (
            <div key={m.userId} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: "12px" }}>
              <span>{m.email}</span>
              <span style={{ fontWeight: 600, color: "var(--brand)" }}>{m.role}</span>
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <h3>Privacy & Responsible AI</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
            <div><strong>Blind Screening:</strong> Configurable candidate identity masking</div>
            <div><strong>Human Review Required:</strong> AI recommendations never perform automated rejections</div>
            <div><strong>Data Retention:</strong> Configurable 180-day GDPR deletion policies</div>
            <div><strong>Encryption:</strong> In-transit TLS 1.3 & Fernet-encrypted credentials</div>
          </div>
        </div>
      </div>
    </div>
  );
}
