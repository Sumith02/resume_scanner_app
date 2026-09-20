import { useEffect, useState } from "react";
import { Copy, Link2, Plus, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, Modal, StatusBadge } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import { formatDate } from "../../lib/format";
import type { Job, PortalToken } from "../../types";

export function PortalPage() {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<PortalToken[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const jobTitle = (id: number) => jobs.find((j) => j.id === id)?.title ?? `Job #${id}`;

  async function load() {
    try {
      const [t, j] = await Promise.all([api.listPortalTokens(), api.listJobs()]);
      setTokens(t);
      setJobs(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load portal links");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function copy(token: PortalToken) {
    if (!token.token) return;
    const url = `${window.location.origin}/portal/${token.token}`;
    void navigator.clipboard.writeText(url);
    setNotice(`Copied: ${url}`);
  }

  async function toggle(token: PortalToken) {
    await api.updatePortalToken(token.id, { is_active: !token.is_active });
    await load();
  }

  async function remove(token: PortalToken) {
    if (!confirm(`Delete portal link for ${token.client_name}?`)) return;
    await api.deletePortalToken(token.id);
    await load();
  }

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="page-head">
        <div>
          <h1>Client Portal</h1>
          <div className="sub">Share read-only, token-based access to jobs and shortlists.</div>
        </div>
        {can(user, "portal:manage") && (
          <button className="btn primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> New portal link
          </button>
        )}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Jobs</th>
              <th>Candidates</th>
              <th>Status</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.client_name}</strong>
                </td>
                <td>{t.job_ids.length ? t.job_ids.map(jobTitle).join(", ") : "All jobs"}</td>
                <td>{t.can_view_candidates ? "Visible" : "Hidden"}</td>
                <td>
                  <StatusBadge status={t.is_active ? "ACTIVE" : "DEACTIVATED"} />
                </td>
                <td>{t.expires_at ? formatDate(t.expires_at) : "Never"}</td>
                <td style={{ textAlign: "right" }}>
                  {can(user, "portal:manage") && (
                    <>
                      {t.token && (
                        <button className="icon-btn" title="Copy link" onClick={() => copy(t)}>
                          <Copy size={15} />
                        </button>
                      )}
                      <button className="btn sm ghost" onClick={() => toggle(t)}>
                        {t.is_active ? "Disable" : "Enable"}
                      </button>
                      <button className="icon-btn" title="Delete" onClick={() => remove(t)}>
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tokens.length === 0 && (
          <Empty title="No portal links" hint="Create a link and send it to your client." />
        )}
      </div>

      {showForm && (
        <PortalModal
          jobs={jobs}
          onClose={() => setShowForm(false)}
          onSaved={() => void load()}
        />
      )}
    </>
  );
}

function PortalModal({
  jobs,
  onClose,
  onSaved,
}: {
  jobs: Job[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientName, setClientName] = useState("");
  const [jobIds, setJobIds] = useState<number[]>([]);
  const [canView, setCanView] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<PortalToken | null>(null);

  const link = created?.token ? `${window.location.origin}/portal/${created.token}` : "";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.createPortalToken({
        client_name: clientName,
        job_ids: jobIds,
        can_view_candidates: canView,
        expires_in_days: expiresInDays || undefined,
      });
      onSaved();
      setCreated(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Modal
        title="Portal link ready"
        onClose={onClose}
        footer={
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        }
      >
        <Alert kind="success">
          Share this link with <strong>{created.client_name}</strong>. It is only shown once.
        </Alert>
        <div className="field">
          <label>Portal URL</label>
          <div className="flex" style={{ gap: 8 }}>
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button
              className="btn primary"
              onClick={() => navigator.clipboard.writeText(link)}
              type="button"
            >
              <Copy size={15} /> Copy
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="New portal link"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !clientName} onClick={save}>
            {busy ? "Creating…" : "Create link"}
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="field">
        <label>Client name</label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Jobs ({jobIds.length ? jobIds.length : "all"})</label>
        <select
          multiple
          size={5}
          value={jobIds.map(String)}
          onChange={(e) => setJobIds(Array.from(e.target.selectedOptions, (o) => Number(o.value)))}
        >
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <div className="field">
          <label>
            <input type="checkbox" checked={canView} onChange={(e) => setCanView(e.target.checked)} />{" "}
            Show candidate details
          </label>
        </div>
        <div className="field">
          <label>Expires in (days)</label>
          <input
            type="number"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        <Link2 size={12} /> The link is read-only and scoped to the selected jobs.
      </div>
    </Modal>
  );
}
