import { useEffect, useState } from "react";
import { Building2, Plus, UserPlus } from "lucide-react";
import { api } from "../../api";
import { Modal, StatusBadge, Alert } from "../../components/ui";
import { InviteBox } from "../../components/InviteBox";
import { formatDate, roleLabel } from "../../lib/format";
import type { Company } from "../../types";

export function MasterCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [inviteFor, setInviteFor] = useState<Company | null>(null);

  async function load() {
    try {
      setCompanies(await api.listCompanies());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load companies");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function changeStatus(org: Company, status: string) {
    try {
      await api.setCompanyStatus(org.id, status);
      setNotice(`${org.name} is now ${status.replace(/_/g, " ").toLowerCase()}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status update failed");
    }
  }

  async function changePlan(org: Company, planCode: string) {
    try {
      await api.setCompanyPlan(org.id, planCode);
      setNotice(`${org.name} plan updated to ${planCode.toUpperCase()}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan update failed");
    }
  }

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="page-head">
        <div>
          <h1>Companies</h1>
          <div className="sub">Provision customer tenants and manage their lifecycle.</div>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Create company
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Plan Tier</th>
                <th>Seats</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="flex">
                      <div className="avatar" style={{ borderRadius: 9 }}>
                        {c.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 650 }}>{c.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {c.email ?? c.slug}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td>
                    <select
                      value={c.plan_code || "starter"}
                      style={{
                        padding: "3px 8px",
                        fontSize: 12,
                        borderRadius: 6,
                        border: "1px solid #cbd5e1",
                        background: (c.plan_code || "starter") === "growth" ? "#ecfdf5" : (c.plan_code || "starter") === "enterprise" ? "#eff6ff" : "#f8fafc",
                        color: (c.plan_code || "starter") === "growth" ? "#065f46" : (c.plan_code || "starter") === "enterprise" ? "#1e40af" : "#475569",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                      onChange={(e) => changePlan(c, e.target.value)}
                    >
                      <option value="growth">Growth (Gmail Sync)</option>
                      <option value="enterprise">Enterprise</option>
                      <option value="starter">Starter (No Sync)</option>
                    </select>
                  </td>
                  <td>
                    {c.seats ? (
                      <span>
                        <strong>{c.seats.used}</strong>
                        <span className="muted"> / {c.seats.limit}</span>
                        {c.pending_seat_requests ? (
                          <span className="pill" style={{ marginLeft: 8 }}>
                            {c.pending_seat_requests} request
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="muted">{formatDate(c.created_at)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      className="btn sm ghost"
                      onClick={() => setInviteFor(c)}
                      title="Invite admin"
                    >
                      <UserPlus size={14} /> Admin
                    </button>{" "}
                    {c.status !== "SUSPENDED" && c.status !== "DEACTIVATED" && (
                      <button className="btn sm ghost" onClick={() => changeStatus(c, "SUSPENDED")}>
                        Suspend
                      </button>
                    )}
                    {c.status === "SUSPENDED" && (
                      <button className="btn sm ghost" onClick={() => changeStatus(c, "ACTIVE")}>
                        Reactivate
                      </button>
                    )}
                    {c.status !== "DEACTIVATED" && (
                      <button className="btn sm ghost" onClick={() => changeStatus(c, "DEACTIVATED")}>
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      <div className="big">No companies yet</div>
                      <div>Provision your first customer tenant to get started.</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateCompanyModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            setNotice("Company created and administrator invited.");
            await load();
          }}
        />
      )}

      {inviteFor && (
        <InviteAdminModal company={inviteFor} onClose={() => setInviteFor(null)} />
      )}
    </>
  );
}

function CreateCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", seat_limit: 10, plan: "growth" });
  const [result, setResult] = useState<{ email: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createCompany(form);
      setResult({ email: res.admin.email, token: res.invite_token });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Create company"
      onClose={onClose}
      footer={
        result ? (
          <button className="btn primary" onClick={onCreated}>
            Done
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy} onClick={submit}>
              {busy ? "Creating…" : "Create & invite admin"}
            </button>
          </>
        )
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      {result ? (
        <>
          <Alert kind="success">Company provisioned. Invitation sent to the company admin.</Alert>
          <InviteBox email={result.email} token={result.token} />
        </>
      ) : (
        <>
          <div className="field">
            <label>Company name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Acme Recruiting"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Company admin email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="owner@acmeltd.com"
            />
          </div>
          <div className="field">
            <label>Plan tier</label>
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
            >
              <option value="growth">Growth (Recommended — includes Gmail sync & AI matching)</option>
              <option value="enterprise">Enterprise (Includes all features + API access)</option>
              <option value="starter">Starter (Free — manual upload only)</option>
            </select>
          </div>
          <div className="field">
            <label>Allocated user seats</label>
            <input
              type="number"
              min={1}
              value={form.seat_limit}
              onChange={(e) => setForm({ ...form, seat_limit: Number(e.target.value) })}
            />
          </div>
          <div className="flex" style={{ color: "var(--muted)", fontSize: 12.5 }}>
            <Building2 size={15} />
            Creates an isolated tenant, its admin, quotas, and default settings.
          </div>
        </>
      )}
    </Modal>
  );
}

function InviteAdminModal({ company, onClose }: { company: Company; onClose: () => void }) {
  const [form, setForm] = useState({ email: "", name: "", role: "COMPANY_ADMIN" });
  const [result, setResult] = useState<{ email: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.inviteCompanyAdmin(company.id, form);
      setResult({ email: res.user.email, token: res.invite_token });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Invite admin — ${company.name}`}
      onClose={onClose}
      footer={
        result ? (
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy} onClick={submit}>
              {busy ? "Inviting…" : "Send invitation"}
            </button>
          </>
        )
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      {result ? (
        <InviteBox email={result.email} token={result.token} />
      ) : (
        <>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="COMPANY_ADMIN">{roleLabel("COMPANY_ADMIN")}</option>
              <option value="COMPANY_OWNER">{roleLabel("COMPANY_OWNER")}</option>
            </select>
          </div>
          <Alert kind="info">
            Seat check is enforced server-side against {company.name}'s allocated limit.
          </Alert>
        </>
      )}
    </Modal>
  );
}