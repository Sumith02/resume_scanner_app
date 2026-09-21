import { useEffect, useState } from "react";
import { Check, Inbox, Mail, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, Modal, StatusBadge } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import { formatDate } from "../../lib/format";
import type { Candidate, EmailMessage, EmailTemplate, GmailStatus } from "../../types";

export function EmailPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"outbox" | "templates" | "gmail">("outbox");
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const candName = (id: number | null) =>
    id ? candidates.find((c) => c.id === id)?.name ?? `Candidate #${id}` : "—";

  async function load() {
    try {
      const [m, t, c, g] = await Promise.all([
        api.listEmailMessages(),
        api.listEmailTemplates(),
        api.listCandidates({ limit: 200 }),
        api.gmailStatus(),
      ]);
      setMessages(m);
      setTemplates(t);
      setCandidates(c);
      setGmail(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load email");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get("gmail");
    if (gmailParam === "connected") {
      setTab("gmail");
      setNotice("Gmail account successfully connected! You can now click Sync Mailbox to fetch resumes.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (gmailParam === "error") {
      setTab("gmail");
      const details = params.get("details");
      setError(details ? `Gmail connection error: ${decodeURIComponent(details)}` : "Failed to connect Gmail account.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    void load();
  }, []);

  async function connect() {
    setError(null);
    try {
      const res = await api.gmailConnect();
      if (res.auth_url) window.location.href = res.auth_url;
      else setNotice(res.message ?? "Gmail OAuth is not configured.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connect failed";
      if (msg.includes("not included in the") || msg.includes("gmail_sync")) {
        setError("Gmail Sync is only enabled on Growth & Enterprise plans. Please contact your Platform Administrator to enable it.");
      } else {
        setError(msg);
      }
    }
  }

  async function connectDemo() {
    setError(null);
    try {
      await api.gmailConnectDemo();
      setNotice("Demo inbox connected.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo connect failed");
    }
  }

  async function sync(fullScan = false) {
    setSyncBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.gmailSync({ full_scan: fullScan });
      const summary = (res.summary || {}) as Record<string, any>;
      if (summary.error) {
        setError(`Sync issue: ${summary.error}`);
      } else {
        const ingested = summary.ingested ?? 0;
        const cands = (summary.ingested_candidates || []) as string[];
        const errors = (summary.errors || []) as string[];

        if (ingested > 0) {
          const names = cands.length > 0 ? `: ${cands.join(", ")}` : "";
          setNotice(`✅ Successfully imported ${ingested} candidate resume(s)${names}. View them in the Candidates tab!`);
        } else {
          setNotice(`Scan complete: 0 new resumes found (${summary.skipped ?? 0} non-resume files filtered).`);
        }
        if (errors.length > 0) {
          setError(`Note: ${errors.length} file(s) encountered processing errors: ${errors.slice(0, 2).join("; ")}`);
        }
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      if (msg.includes("not included in the") || msg.includes("gmail_sync")) {
        setError("Gmail Sync is only enabled on Growth & Enterprise plans. Please contact your Platform Administrator to enable it.");
      } else {
        setError(msg);
      }
    } finally {
      setSyncBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Gmail account?")) return;
    await api.gmailDisconnect();
    await load();
  }

  async function removeTemplate(t: EmailTemplate) {
    await api.deleteEmailTemplate(t.id);
    await load();
  }

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="page-head">
        <div>
          <h1>Email</h1>
          <div className="sub">Send candidate emails and sync resumes from Gmail.</div>
        </div>
        {tab === "templates"
          ? can(user, "email:manage") && (
              <button className="btn primary" onClick={() => setShowTemplate(true)}>
                <Plus size={16} /> New template
              </button>
            )
          : can(user, "email:manage") && (
              <button className="btn primary" onClick={() => setShowCompose(true)}>
                <Send size={16} /> Compose
              </button>
            )}
      </div>

      <div className="tabs">
        <button className={tab === "outbox" ? "active" : ""} onClick={() => setTab("outbox")}>
          Outbox
        </button>
        <button className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>
          Templates
        </button>
        <button className={tab === "gmail" ? "active" : ""} onClick={() => setTab("gmail")}>
          Gmail sync
        </button>
      </div>

      {tab === "outbox" && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>To</th>
                <th>Candidate</th>
                <th>Subject</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td>{m.to_email}</td>
                  <td>{candName(m.candidate_id)}</td>
                  <td>{m.subject}</td>
                  <td>{m.provider}</td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td>{m.sent_at ? formatDate(m.sent_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {messages.length === 0 && <Empty title="No emails sent yet" />}
        </div>
      )}

      {tab === "templates" && (
        <div className="grid cols-3">
          {templates.map((t) => (
            <div className="card" key={t.id}>
              <div className="flex between">
                <strong>{t.name}</strong>
                {can(user, "email:manage") && (
                  <button className="icon-btn" onClick={() => removeTemplate(t)} title="Delete">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {t.subject}
              </div>
              <div style={{ fontSize: 12.5, marginTop: 8, whiteSpace: "pre-wrap" }}>
                {t.body.slice(0, 160)}
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="card">
              <Empty title="No templates" hint="Create reusable email templates." />
            </div>
          )}
        </div>
      )}

      {tab === "gmail" && gmail && (
        <div className="card">
          <h3>
            <Inbox size={15} /> Resume ingestion from Gmail
          </h3>
          {gmail.account ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{gmail.account.email ?? "Demo Inbox"}</span>
                  <StatusBadge status={gmail.account.status} />
                  {gmail.account.is_demo && <span className="badge">Demo Mode</span>}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  Last sync: {gmail.account.last_sync_at ? formatDate(gmail.account.last_sync_at) : "never"}
                </span>
              </div>

              {gmail.account.last_sync_summary && (() => {
                const summary = gmail.account.last_sync_summary as Record<string, any>;
                const ingested = summary.ingested ?? 0;
                const checked = summary.checked_emails ?? summary.checked ?? 0;
                const skipped = summary.skipped ?? 0;
                const cands = (summary.ingested_candidates || []) as string[];

                return (
                  <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div className="grid cols-3" style={{ gap: 10 }}>
                      <div style={{ padding: "10px 14px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: 8 }}>
                        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600 }}>Resumes Ingested</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#059669", marginTop: 2 }}>{ingested}</div>
                      </div>
                      <div style={{ padding: "10px 14px", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: 8 }}>
                        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600 }}>Threads Scanned</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#2563eb", marginTop: 2 }}>{checked}</div>
                      </div>
                      <div style={{ padding: "10px 14px", background: "rgba(107, 114, 128, 0.08)", border: "1px solid rgba(107, 114, 128, 0.25)", borderRadius: 8 }}>
                        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600 }}>Non-Resumes Filtered</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#4b5563", marginTop: 2 }}>{skipped}</div>
                      </div>
                    </div>

                    {cands.length > 0 && (
                      <div style={{ padding: "10px 14px", background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 8 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#065f46", marginBottom: 6 }}>Imported Candidates:</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {cands.map((name, i) => (
                            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", padding: "2px 8px", borderRadius: 10, fontSize: 12, fontWeight: 500 }}>
                              <Check size={11} /> {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex" style={{ gap: 8, alignItems: "center" }}>
                <button className="btn primary" disabled={syncBusy} onClick={() => sync(false)}>
                  <RefreshCw size={15} className={syncBusy ? "spin" : ""} /> {syncBusy ? "Syncing…" : "Sync now"}
                </button>
                <button
                  className="btn secondary"
                  disabled={syncBusy}
                  onClick={() => sync(true)}
                  title="Force a deep scan of all emails with attachments in your inbox, re-checking any previously skipped emails"
                >
                  <RefreshCw size={15} /> Deep Scan (All)
                </button>
                <button className="btn ghost" onClick={disconnect}>
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                Connect your registered email address ({user?.email}) to automatically import
                resumes from candidate emails. Only the email added for your account can be
                connected. OAuth is {gmail.oauth_configured ? "configured" : "not configured"}
                {gmail.demo_available && " · demo inbox is available"}.
              </div>
              <div className="flex" style={{ gap: 8 }}>
                <button className="btn primary" disabled={!gmail.oauth_configured} onClick={connect}>
                  <Mail size={15} /> Connect Gmail
                </button>
                {gmail.demo_available && (
                  <button className="btn ghost" onClick={connectDemo}>
                    Use demo inbox
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showCompose && (
        <ComposeModal
          candidates={candidates}
          templates={templates}
          onClose={() => setShowCompose(false)}
          onSaved={() => {
            setShowCompose(false);
            void load();
          }}
        />
      )}

      {showTemplate && (
        <TemplateModal
          onClose={() => setShowTemplate(false)}
          onSaved={() => {
            setShowTemplate(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function ComposeModal({
  candidates,
  templates,
  onClose,
  onSaved,
}: {
  candidates: Candidate[];
  templates: EmailTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? 0);
  const [templateId, setTemplateId] = useState(0);
  const [to, setTo] = useState(candidates[0]?.email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function applyTemplate(id: number) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }

  function pickCandidate(id: number) {
    setCandidateId(id);
    const c = candidates.find((x) => x.id === id);
    if (c?.email) setTo(c.email);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.sendEmail({
        candidate_id: candidateId || undefined,
        to_email: to || undefined,
        subject,
        body,
        template_id: templateId || undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Compose email"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !subject || (!to && !candidateId)} onClick={save}>
            {busy ? "Sending…" : "Send"}
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="row">
        <div className="field">
          <label>Candidate</label>
          <select value={candidateId} onChange={(e) => pickCandidate(Number(e.target.value))}>
            <option value={0}>— none —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Template</label>
          <select value={templateId} onChange={(e) => applyTemplate(Number(e.target.value))}>
            <option value={0}>— none —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>To</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="candidate@example.com" />
      </div>
      <div className="field">
        <label>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="field">
        <label>Body</label>
        <textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
    </Modal>
  );
}

function TemplateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.createEmailTemplate({ name, subject, body });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New template"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !name} onClick={save}>
            {busy ? "Saving…" : "Create"}
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="field">
        <label>Body</label>
        <textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
    </Modal>
  );
}
