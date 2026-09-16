import { useState } from "react";
import { Building2, Users, Briefcase, Zap, Plus, CheckCircle2, Shield } from "lucide-react";
import type { AgencyClient } from "./types";

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newJobs, setNewJobs] = useState(5);
  const [newCandidates, setNewCandidates] = useState(2500);
  const [newRecruiters, setNewRecruiters] = useState(2);

  const totalJobs = clients.reduce((acc, c) => acc + c.openJobsCount, 0);
  const totalCandidates = clients.reduce((acc, c) => acc + c.candidatePoolCount, 0);
  const totalRecruiters = clients.reduce((acc, c) => acc + c.recruiterCount, 0);

  return (
    <div className="agency-multi-client-view">
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <Building2 size={22} color="var(--brand)" />
            <h2 style={{ margin: 0, fontSize: "20px" }}>Multi-Client Recruitment OS</h2>
            <span className="agency-badge">Agency Multi-Tenancy</span>
          </div>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
            Manage isolated client databases, allocate recruiter capacity, and leverage cross-client talent rediscovery memory.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => setShowCreateModal(true)}
            className="button"
            style={{ background: "#111827", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Plus size={16} />
            <span>Add Client Account</span>
          </button>
        </div>
      </div>

      {/* WHAT IS MULTI-CLIENT OS EXPLANATION */}
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
          <span style={{ fontSize: "11px", background: "rgba(15, 118, 110, 0.15)", color: "#0f766e", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>Agency Feature</span>
        </div>
        <div>
          This module is designed for <strong>Recruitment Agencies, Headhunters, & Staffing Firms</strong> managing multiple client corporate accounts simultaneously under one roof. It isolates candidates, jobs, and recruiters per client to prevent data leaks.
        </div>
        <div style={{ marginTop: "4px", color: "#64748b", fontSize: "12px" }}>
          👉 <em>Note for Direct Employers:</em> If your company is hiring directly for your own team, you do not need this view. Your team manages candidates directly in the <strong>Talent Database</strong> and <strong>Command Center</strong>.
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
          <span className="kpi-val" style={{ color: "var(--brand)" }}>{totalJobs}</span>
          <span className="kpi-sub">Vacancies being recruited</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">CANDIDATE INTELLIGENCE POOL</span>
          <span className="kpi-val" style={{ color: "var(--green)" }}>{(totalCandidates / 1000).toFixed(1)}k</span>
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
              <div
                key={client.id}
                className={`agency-client-card ${isActive ? "active-client" : ""}`}
              >
                {/* CARD HEADER */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <strong style={{ fontSize: "16px" }}>{client.code}</strong>
                      {isActive && (
                        <span style={{ background: "#dcfce7", color: "#15803d", fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "8px" }}>
                          ACTIVE WORKSPACE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "2px" }}>{client.name}</div>
                  </div>
                  <span className="agency-badge">{client.tier}</span>
                </div>

                {/* STATS TREE AS SPECIFIED IN USER REQUEST */}
                <div style={{ background: "#f8fafc", borderRadius: "6px", padding: "12px 14px", marginBottom: "14px", fontSize: "13px", fontFamily: "monospace" }}>
                  <div style={{ fontWeight: 700, marginBottom: "4px", color: "var(--ink)" }}>{client.code}</div>
                  <div style={{ color: "#334155" }}>├── <Briefcase size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> <strong>{client.openJobsCount}</strong> open jobs</div>
                  <div style={{ color: "#334155" }}>├── <Users size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> <strong>{client.candidatePoolCount.toLocaleString()}</strong> candidates</div>
                  <div style={{ color: "#334155" }}>└── <Shield size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> <strong>{client.recruiterCount}</strong> recruiters</div>
                </div>

                {/* DETAILS */}
                <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div><strong>Industry:</strong> {client.industry}</div>
                  <div><strong>SLA Delivery:</strong> {client.slaHours} hours response</div>
                  <div><strong>Avg Placement:</strong> {client.avgPlacementDays} days</div>
                </div>

                {/* ASSIGNED RECRUITERS CHIPS */}
                <div style={{ marginBottom: "16px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
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

                {/* VACANCY SAMPLES */}
                <div style={{ marginBottom: "16px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                    Active Key Vacancies:
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {client.recentVacancies.map((v, i) => (
                      <span key={i} style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "11px" }}>
                        {v}
                      </span>
                    ))}
                  </div>
                </div>

                {/* SWITCH BUTTON */}
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
            <button type="submit" style={{ background: "var(--brand)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "4px", fontWeight: 600 }}>
              Create Client
            </button>
            <button type="button" onClick={() => setShowCreateModal(false)} style={{ background: "#f1f5f9", border: "none", padding: "8px 12px", borderRadius: "4px" }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
