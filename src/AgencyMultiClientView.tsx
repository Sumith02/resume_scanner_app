import { useState, useEffect } from "react";
import {
  Building2,
  Users,
  Briefcase,
  Zap,
  Plus,
  CheckCircle2,
  Shield,
  DollarSign,
  Share2
} from "lucide-react";
import type {
  AgencyClient,
  ClientJob,
  PlacementRecord,
  AgencyInvoice
} from "./types";
import {
  fetchClientJobs,
  createClientJob,
  shareCandidateWithClient,
  fetchPlacements,
  recordPlacement,
  fetchAgencyInvoices,
  generateInvoice
} from "./api";

interface AgencyMultiClientViewProps {
  clients: AgencyClient[];
  activeClientId: string;
  onSwitchClient: (clientId: string) => void;
  onCreateClient: (payload: Partial<AgencyClient>) => void;
  onNavigateToRediscovery: () => void;
}

export function AgencyMultiClientView({
  clients,
  activeClientId,
  onSwitchClient,
  onCreateClient,
  onNavigateToRediscovery
}: AgencyMultiClientViewProps) {
  const [subView, setSubView] = useState<"workspaces" | "requisitions" | "billing">("workspaces");

  // Client Workspaces state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newJobs, setNewJobs] = useState(5);
  const [newCandidates, setNewCandidates] = useState(2500);
  const [newRecruiters, setNewRecruiters] = useState(2);

  // Client Requisitions & Shortlists state
  const [selectedClientId, setSelectedClientId] = useState(activeClientId || clients[0]?.id || "client-1");
  const [clientJobs, setClientJobs] = useState<ClientJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [showCreateJobModal, setShowCreateJobModal] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobDept, setNewJobDept] = useState("Engineering");
  const [newJobFeePercent, setNewJobFeePercent] = useState(20);
  const [newJobHires, setNewJobHires] = useState(2);

  // Shortlist share state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCandidateId, setShareCandidateId] = useState("");
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  // Billing & Placements state
  const [placements, setPlacements] = useState<PlacementRecord[]>([]);
  const [invoices, setInvoices] = useState<AgencyInvoice[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [showRecordPlacementModal, setShowRecordPlacementModal] = useState(false);
  const [placeCandidateName, setPlaceCandidateName] = useState("");
  const [placeSalary, setPlaceSalary] = useState(150000);
  const [placeFeePercent, setPlaceFeePercent] = useState(20);

  const totalJobs = clients.reduce((acc, c) => acc + c.openJobsCount, 0);
  const totalCandidates = clients.reduce((acc, c) => acc + c.candidatePoolCount, 0);
  const totalRecruiters = clients.reduce((acc, c) => acc + c.recruiterCount, 0);

  useEffect(() => {
    if (subView === "requisitions" && selectedClientId) {
      setLoadingJobs(true);
      fetchClientJobs(selectedClientId)
        .then((jobs) => setClientJobs(jobs || []))
        .catch(() => {})
        .finally(() => setLoadingJobs(false));
    } else if (subView === "billing") {
      setLoadingBilling(true);
      Promise.all([fetchPlacements(), fetchAgencyInvoices()])
        .then(([allPlacements, allInvoices]) => {
          setPlacements(allPlacements || []);
          setInvoices(allInvoices || []);
        })
        .catch(() => {})
        .finally(() => setLoadingBilling(false));
    }
  }, [subView, selectedClientId]);

  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await createClientJob({
        clientId: selectedClientId,
        title: newJobTitle,
        department: newJobDept,
        feePercentage: Number(newJobFeePercent),
        targetHires: Number(newJobHires),
        filledHires: 0,
        status: "open"
      });
      setClientJobs((prev) => [created, ...prev]);
      setShowCreateJobModal(false);
      setNewJobTitle("");
    } catch (err) {
      alert("Failed to create client requisition: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  async function handleShareCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (!shareCandidateId) return;
    try {
      const shortlist = await shareCandidateWithClient({
        clientId: selectedClientId,
        candidateId: shareCandidateId
      });
      setShowShareModal(false);
      setShareNotice(`Candidate shared with client portal. Client token: ${shortlist.id}`);
      setTimeout(() => setShareNotice(null), 8000);
    } catch (err) {
      alert("Failed to share candidate: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  async function handleRecordPlacement(e: React.FormEvent) {
    e.preventDefault();
    try {
      const feeAmount = Math.round(Number(placeSalary) * (Number(placeFeePercent) / 100));
      const newPlacement = await recordPlacement({
        clientId: selectedClientId,
        candidateId: "cand-placed-" + Date.now(),
        candidateName: placeCandidateName,
        baseSalary: Number(placeSalary),
        placementFee: feeAmount,
        guaranteeDays: 90,
        placedDate: new Date().toISOString().split("T")[0],
        invoiceStatus: "invoiced"
      });
      setPlacements((prev) => [newPlacement, ...prev]);

      // Automatically generate invoice draft
      const newInvoice = await generateInvoice({
        clientId: selectedClientId,
        invoiceNumber: "INV-" + Date.now().toString().slice(-6),
        amount: feeAmount,
        currency: "USD",
        dueDate: new Date(Date.now() + 86400000 * 30).toISOString().split("T")[0],
        status: "sent"
      });
      setInvoices((prev) => [newInvoice, ...prev]);

      setShowRecordPlacementModal(false);
      setPlaceCandidateName("");
    } catch (err) {
      alert("Failed to record placement: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  return (
    <div className="agency-multi-client-view">
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <Building2 size={22} color="var(--brand)" />
            <h2 style={{ margin: 0, fontSize: "20px" }}>Agency Multi-Client Recruitment OS</h2>
            <span className="agency-badge">Multi-Tenancy</span>
          </div>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
            Manage client requisition databases, allocate recruiter capacity, share blind shortlists, and track placement billing.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => setShowCreateModal(true)}
            className="button"
            style={{
              background: "#111827",
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              borderRadius: "6px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <Plus size={16} />
            <span>Add Client Account</span>
          </button>
        </div>
      </div>

      {/* SUB-NAV TABS */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid var(--line)",
          marginBottom: "20px",
          paddingBottom: "8px"
        }}
      >
        <button
          type="button"
          onClick={() => setSubView("workspaces")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            background: subView === "workspaces" ? "#1f2937" : "transparent",
            color: subView === "workspaces" ? "#fff" : "#64748b",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          <Building2 size={16} />
          <span>Client Workspaces & Allocations</span>
        </button>

        <button
          type="button"
          onClick={() => setSubView("requisitions")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            background: subView === "requisitions" ? "#1f2937" : "transparent",
            color: subView === "requisitions" ? "#fff" : "#64748b",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          <Briefcase size={16} />
          <span>Client Requisitions & Portals</span>
        </button>

        <button
          type="button"
          onClick={() => setSubView("billing")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            background: subView === "billing" ? "#1f2937" : "transparent",
            color: subView === "billing" ? "#fff" : "#64748b",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          <DollarSign size={16} />
          <span>Placements & Invoicing</span>
        </button>
      </div>

      {shareNotice && (
        <div
          style={{
            background: "#dcfce7",
            border: "1px solid #86efac",
            color: "#166534",
            padding: "10px 14px",
            borderRadius: "6px",
            fontSize: "13px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <CheckCircle2 size={16} />
          <span>{shareNotice}</span>
        </div>
      )}

      {/* 1. WORKSPACES VIEW */}
      {subView === "workspaces" && (
        <>
          {/* EXPLANATION */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(15, 118, 110, 0.06), rgba(59, 130, 246, 0.06))",
              border: "1px solid rgba(45, 212, 191, 0.3)",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "20px",
              fontSize: "13px",
              lineHeight: "1.5",
              color: "#0f172a"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <Shield size={16} color="var(--brand)" />
              <strong>What is Multi-Client OS?</strong>
              <span
                style={{
                  fontSize: "11px",
                  background: "rgba(15, 118, 110, 0.15)",
                  color: "#0f766e",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 600
                }}
              >
                Agency Feature
              </span>
            </div>
            <div>
              Designed for <strong>Recruitment Agencies, Headhunters, & Staffing Firms</strong> managing multiple client
              corporate accounts simultaneously. Candidates, jobs, and recruiters are isolated per client to prevent data
              leaks.
            </div>
          </div>

          {/* AGENCY KPI GRID */}
          <div className="cc-kpi-grid" style={{ marginBottom: "24px" }}>
            <div className="kpi-card">
              <span className="kpi-title">TOTAL CLIENT ACCOUNTS</span>
              <span className="kpi-val">{clients.length}</span>
              <span className="kpi-sub">Active Enterprise Retainers</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">TOTAL OPEN REQUISITIONS</span>
              <span className="kpi-val" style={{ color: "var(--brand)" }}>
                {totalJobs}
              </span>
              <span className="kpi-sub">Vacancies being recruited</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">CANDIDATE INTELLIGENCE POOL</span>
              <span className="kpi-val" style={{ color: "var(--green)" }}>
                {(totalCandidates / 1000).toFixed(1)}k
              </span>
              <span className="kpi-sub">Structured candidate memory</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">ALLOCATED RECRUITERS</span>
              <span className="kpi-val">{totalRecruiters}</span>
              <span className="kpi-sub">Staffing team members</span>
            </div>
          </div>

          {/* CROSS-CLIENT REDISCOVERY HERO BANNER */}
          <div
            style={{
              background: "linear-gradient(135deg, #042f2e 0%, #111827 100%)",
              borderRadius: "8px",
              padding: "20px 24px",
              marginBottom: "24px",
              color: "#fff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <Zap size={18} color="#2dd4bf" />
                <strong style={{ fontSize: "15px", color: "#2dd4bf" }}>Cross-Client Talent Rediscovery Superpower</strong>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#ccfbf1", maxWidth: "720px", lineHeight: "1.5" }}>
                Suppose <strong>CLIENT A</strong> received 8,200 applications and unhired 45 qualified React engineers.
                When <strong>CLIENT B</strong> opens a new vacancy for <em>Senior React Developer</em>, Nexerra instantly searches your existing
                candidate memory, matching qualified talent immediately without spending on job boards.
              </p>
            </div>
            <button
              onClick={onNavigateToRediscovery}
              style={{
                background: "#2dd4bf",
                color: "#042f2e",
                border: "none",
                padding: "10px 18px",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              Launch Rediscovery →
            </button>
          </div>

          {/* CLIENT ACCOUNTS HIERARCHY */}
          <div style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Client Workspaces & Recruiter Allocations</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px" }}>
              {clients.map((client) => {
                const isActive = activeClientId === client.id;
                return (
                  <div key={client.id} className={`agency-client-card ${isActive ? "active-client" : ""}`}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "12px"
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <strong style={{ fontSize: "16px" }}>{client.code}</strong>
                          {isActive && (
                            <span
                              style={{
                                background: "#dcfce7",
                                color: "#15803d",
                                fontSize: "10px",
                                fontWeight: 700,
                                padding: "1px 6px",
                                borderRadius: "8px"
                              }}
                            >
                              ACTIVE WORKSPACE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "2px" }}>{client.name}</div>
                      </div>
                      <span className="agency-badge">{client.tier}</span>
                    </div>

                    <div
                      style={{
                        background: "#f8fafc",
                        borderRadius: "6px",
                        padding: "12px 14px",
                        marginBottom: "14px",
                        fontSize: "13px",
                        fontFamily: "monospace"
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: "4px", color: "var(--ink)" }}>{client.code}</div>
                      <div style={{ color: "#334155" }}>
                        ├── <Briefcase size={13} style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                        <strong>{client.openJobsCount}</strong> open jobs
                      </div>
                      <div style={{ color: "#334155" }}>
                        ├── <Users size={13} style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                        <strong>{client.candidatePoolCount.toLocaleString()}</strong> candidates
                      </div>
                      <div style={{ color: "#334155" }}>
                        └── <Shield size={13} style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                        <strong>{client.recruiterCount}</strong> recruiters
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--muted)",
                        marginBottom: "14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px"
                      }}
                    >
                      <div>
                        <strong>Industry:</strong> {client.industry}
                      </div>
                      <div>
                        <strong>SLA Delivery:</strong> {client.slaHours} hours response
                      </div>
                      <div>
                        <strong>Avg Placement:</strong> {client.avgPlacementDays} days
                      </div>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--muted)",
                          textTransform: "uppercase",
                          display: "block",
                          marginBottom: "6px"
                        }}
                      >
                        Assigned Recruiters ({client.assignedRecruiters.length}):
                      </span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {client.assignedRecruiters.map((r, i) => (
                          <span key={i} className="recruiter-chip">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--muted)",
                          textTransform: "uppercase",
                          display: "block",
                          marginBottom: "6px"
                        }}
                      >
                        Active Key Vacancies:
                      </span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {client.recentVacancies.map((v, i) => (
                          <span
                            key={i}
                            style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "11px" }}
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => onSwitchClient(client.id)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "6px",
                        border: isActive ? "1px solid var(--brand)" : "1px solid var(--line)",
                        background: isActive ? "var(--brand)" : "#fff",
                        color: isActive ? "#fff" : "#111827",
                        fontWeight: 600,
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px"
                      }}
                    >
                      {isActive ? (
                        <>
                          <CheckCircle2 size={14} />
                          <span>Current Active Workspace</span>
                        </>
                      ) : (
                        <span>Switch to {client.code} Workspace →</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* 2. REQUISITIONS & SHORTLISTS VIEW */}
      {subView === "requisitions" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              background: "#f8fafc",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <strong style={{ fontSize: "13px" }}>Select Client Account:</strong>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--line)", fontWeight: 600 }}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                style={{
                  background: "#fff",
                  border: "1px solid var(--line)",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Share2 size={14} />
                <span>Share Shortlist Portal Link</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreateJobModal(true)}
                style={{
                  background: "var(--brand)",
                  color: "#fff",
                  border: "none",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Plus size={14} />
                <span>Post Client Requisition</span>
              </button>
            </div>
          </div>

          {loadingJobs && <div style={{ color: "var(--muted)" }}>Loading client requisitions...</div>}

          {!loadingJobs && clientJobs.length === 0 && (
            <div
              style={{
                background: "#f8fafc",
                padding: "32px",
                borderRadius: "8px",
                textAlign: "center",
                border: "1px dashed #cbd5e1"
              }}
            >
              <Briefcase size={32} color="#94a3b8" style={{ marginBottom: "8px" }} />
              <div style={{ fontWeight: 600, color: "#334155" }}>No Requisitions Open for this Client</div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                Post client vacancies to coordinate talent submission pipelines.
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
            {clientJobs.map((job) => (
              <div
                key={job.id}
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <strong style={{ fontSize: "15px", color: "#0f172a" }}>{job.title}</strong>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      {job.department} • {job.targetHires} target hires
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background: job.status === "open" ? "#dcfce7" : "#f1f5f9",
                      color: job.status === "open" ? "#166534" : "#475569"
                    }}
                  >
                    {job.status}
                  </span>
                </div>

                <div style={{ fontSize: "13px", color: "#334155", background: "#f8fafc", padding: "8px", borderRadius: "4px" }}>
                  Agency Placement Rate: <strong>{job.feePercentage}%</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                    Filled: {job.filledHires} / {job.targetHires} hires
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowShareModal(true);
                    }}
                    style={{
                      background: "#f1f5f9",
                      border: "none",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Share Candidates →
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* CREATE JOB MODAL */}
          {showCreateJobModal && (
            <form
              onSubmit={handleCreateJob}
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "#fff",
                padding: "24px",
                borderRadius: "8px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
                zIndex: 1000,
                width: "420px"
              }}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Post Client Requisition</h3>
              <div style={{ marginBottom: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>Job Requisition Title</label>
                <input
                  type="text"
                  placeholder="e.g. Principal Cloud Security Architect"
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </div>
              <div style={{ marginBottom: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>Department</label>
                <input
                  type="text"
                  value={newJobDept}
                  onChange={(e) => setNewJobDept(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600 }}>Agency Placement Fee (%)</label>
                  <input
                    type="number"
                    value={newJobFeePercent}
                    onChange={(e) => setNewJobFeePercent(Number(e.target.value))}
                    style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600 }}>Target Hires</label>
                  <input
                    type="number"
                    value={newJobHires}
                    onChange={(e) => setNewJobHires(Number(e.target.value))}
                    style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="submit"
                  style={{
                    background: "var(--brand)",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Create Requisition
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateJobModal(false)}
                  style={{ background: "#f1f5f9", border: "none", padding: "8px 12px", borderRadius: "4px" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* SHARE CANDIDATE SHORTLIST MODAL */}
          {showShareModal && (
            <form
              onSubmit={handleShareCandidate}
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "#fff",
                padding: "24px",
                borderRadius: "8px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
                zIndex: 1000,
                width: "420px"
              }}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Generate Client Shortlist Link</h3>
              <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "14px" }}>
                Creates an encrypted, blind client review link. Clients can accept, reject, or request interviews directly.
              </p>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>Candidate Identifier or ID</label>
                <input
                  type="text"
                  placeholder="e.g. app-1 or blind ID"
                  value={shareCandidateId}
                  onChange={(e) => setShareCandidateId(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="submit"
                  style={{
                    background: "var(--brand)",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Generate Portal Link
                </button>
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  style={{ background: "#f1f5f9", border: "none", padding: "8px 12px", borderRadius: "4px" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 3. PLACEMENTS & INVOICING VIEW */}
      {subView === "billing" && (
        <div>
          {/* BILLING KPI CARDS */}
          <div className="cc-kpi-grid" style={{ marginBottom: "24px" }}>
            <div className="kpi-card">
              <span className="kpi-title">TOTAL PLACEMENTS</span>
              <span className="kpi-val">{placements.length}</span>
              <span className="kpi-sub">Successful candidate hires</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">TOTAL AGENCY REVENUE</span>
              <span className="kpi-val" style={{ color: "var(--green)" }}>
                $
                {placements.reduce((acc, p) => acc + (p.placementFee || 0), 0).toLocaleString()}
              </span>
              <span className="kpi-sub">Calculated placement fees</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">ACTIVE INVOICES</span>
              <span className="kpi-val" style={{ color: "var(--brand)" }}>
                {invoices.length}
              </span>
              <span className="kpi-sub">Net 30 billing status</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "16px" }}>Candidate Placements & Fee Log</h3>
            <button
              type="button"
              onClick={() => setShowRecordPlacementModal(true)}
              style={{
                background: "var(--brand)",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <Plus size={16} />
              <span>Record New Placement</span>
            </button>
          </div>

          {loadingBilling && <div style={{ color: "var(--muted)" }}>Loading placement and invoice records...</div>}

          {/* PLACEMENTS TABLE */}
          <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "24px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Candidate Name</th>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Placed Date</th>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Base Salary</th>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Agency Fee</th>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Guarantee Period</th>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Invoice Status</th>
                </tr>
              </thead>
              <tbody>
                {placements.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{p.candidateName}</td>
                    <td style={{ padding: "10px 14px", color: "#475569" }}>{p.placedDate}</td>
                    <td style={{ padding: "10px 14px" }}>${p.baseSalary?.toLocaleString()}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--green)" }}>
                      ${p.placementFee?.toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 14px" }}>{p.guaranteeDays} days</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          background: "#dcfce7",
                          color: "#166534",
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px"
                        }}
                      >
                        {p.invoiceStatus.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
                {placements.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
                      No placements recorded yet. Click "Record New Placement" to track fee revenue.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* INVOICES SECTION */}
          <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Automated Invoicing & Collections</h3>
          <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Invoice #</th>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Client Workspace</th>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Amount Due</th>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Payment Due</th>
                  <th style={{ padding: "10px 14px", color: "var(--muted)" }}>Billing Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700, fontFamily: "monospace" }}>{inv.invoiceNumber}</td>
                    <td style={{ padding: "10px 14px" }}>{inv.clientId.toUpperCase()}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>${inv.amount.toLocaleString()}</td>
                    <td style={{ padding: "10px 14px", color: "#64748b" }}>{inv.dueDate}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          background: inv.status === "paid" ? "#dcfce7" : "#dbeafe",
                          color: inv.status === "paid" ? "#166534" : "#1e40af",
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "12px",
                          textTransform: "uppercase"
                        }}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
                      No invoices currently outstanding.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* RECORD PLACEMENT MODAL */}
          {showRecordPlacementModal && (
            <form
              onSubmit={handleRecordPlacement}
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "#fff",
                padding: "24px",
                borderRadius: "8px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
                zIndex: 1000,
                width: "420px"
              }}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Record Candidate Placement</h3>
              <div style={{ marginBottom: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>Candidate Name</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Rivera"
                  value={placeCandidateName}
                  onChange={(e) => setPlaceCandidateName(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600 }}>Base Salary ($)</label>
                  <input
                    type="number"
                    value={placeSalary}
                    onChange={(e) => setPlaceSalary(Number(e.target.value))}
                    style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600 }}>Agency Fee %</label>
                  <input
                    type="number"
                    value={placeFeePercent}
                    onChange={(e) => setPlaceFeePercent(Number(e.target.value))}
                    style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                  />
                </div>
              </div>
              <div
                style={{
                  background: "#f0fdf4",
                  padding: "10px",
                  borderRadius: "6px",
                  marginBottom: "16px",
                  fontSize: "12px",
                  color: "#166534"
                }}
              >
                Computed Placement Fee:{" "}
                <strong>${Math.round(placeSalary * (placeFeePercent / 100)).toLocaleString()}</strong>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="submit"
                  style={{
                    background: "var(--brand)",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Confirm & Generate Invoice
                </button>
                <button
                  type="button"
                  onClick={() => setShowRecordPlacementModal(false)}
                  style={{ background: "#f1f5f9", border: "none", padding: "8px 12px", borderRadius: "4px" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* CREATE CLIENT MODAL */}
      {showCreateModal && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreateClient({
              name: newClientName,
              industry: newIndustry,
              openJobsCount: Number(newJobs),
              candidatePoolCount: Number(newCandidates),
              recruiterCount: Number(newRecruiters),
              assignedRecruiters: ["Lead Recruiter", "Associate Recruiter"],
              recentVacancies: ["Senior Software Engineer", "Product Manager"]
            });
            setShowCreateModal(false);
            setNewClientName("");
            setNewIndustry("");
          }}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "#fff",
            padding: "24px",
            borderRadius: "8px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            zIndex: 1000,
            width: "420px"
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Add Agency Client Account</h3>
          <div style={{ marginBottom: "10px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600 }}>Client Enterprise Name</label>
            <input
              type="text"
              placeholder="e.g. Acme FinTech Corp"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              required
              style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
            />
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600 }}>Industry</label>
            <input
              type="text"
              placeholder="e.g. Enterprise Cloud & Security"
              value={newIndustry}
              onChange={(e) => setNewIndustry(e.target.value)}
              required
              style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--line)" }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: 600 }}>Open Jobs</label>
              <input
                type="number"
                value={newJobs}
                onChange={(e) => setNewJobs(Number(e.target.value))}
                style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "11px", fontWeight: 600 }}>Candidates</label>
              <input
                type="number"
                value={newCandidates}
                onChange={(e) => setNewCandidates(Number(e.target.value))}
                style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "11px", fontWeight: 600 }}>Recruiters</label>
              <input
                type="number"
                value={newRecruiters}
                onChange={(e) => setNewRecruiters(Number(e.target.value))}
                style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="submit"
              style={{
                background: "var(--brand)",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "4px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Create Client
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              style={{ background: "#f1f5f9", border: "none", padding: "8px 12px", borderRadius: "4px" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
