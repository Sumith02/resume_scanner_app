import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock, Plus, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, Modal, StatusBadge } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import { formatDate } from "../../lib/format";
import type { Candidate, Job, Offer, OnboardingTask } from "../../types";

export function OffersPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"offers" | "onboarding">("offers");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showOffer, setShowOffer] = useState(false);
  const [showTask, setShowTask] = useState(false);

  const candName = (id: number) => candidates.find((c) => c.id === id)?.name ?? `Candidate #${id}`;
  const jobTitle = (id: number | null) =>
    id ? jobs.find((j) => j.id === id)?.title ?? `Job #${id}` : "—";

  async function load() {
    try {
      const [o, t, c, j] = await Promise.all([
        api.listOffers(),
        api.listOnboarding(),
        api.listCandidates({ limit: 200 }),
        api.listJobs(),
      ]);
      setOffers(o);
      setTasks(t);
      setCandidates(c);
      setJobs(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function setStatus(offer: Offer, status: string) {
    try {
      await api.setOfferStatus(offer.id, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function removeOffer(offer: Offer) {
    if (!confirm("Delete this offer?")) return;
    await api.deleteOffer(offer.id);
    await load();
  }

  async function toggleTask(task: OnboardingTask) {
    const next = task.status === "DONE" ? "PENDING" : "DONE";
    await api.updateOnboardingTask(task.id, { status: next });
    await load();
  }

  async function removeTask(task: OnboardingTask) {
    await api.deleteOnboardingTask(task.id);
    await load();
  }

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}

      <div className="page-head">
        <div>
          <h1>Offers & Onboarding</h1>
          <div className="sub">Send offers and run the post-acceptance checklist.</div>
        </div>
        {tab === "offers"
          ? can(user, "offer:manage") && (
              <button className="btn primary" onClick={() => setShowOffer(true)}>
                <Plus size={16} /> New offer
              </button>
            )
          : can(user, "onboarding:manage") && (
              <button className="btn primary" onClick={() => setShowTask(true)}>
                <Plus size={16} /> New task
              </button>
            )}
      </div>

      <div className="tabs">
        <button className={tab === "offers" ? "active" : ""} onClick={() => setTab("offers")}>
          Offers
        </button>
        <button
          className={tab === "onboarding" ? "active" : ""}
          onClick={() => setTab("onboarding")}
        >
          Onboarding
        </button>
      </div>

      {tab === "offers" && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Job</th>
                <th>Salary</th>
                <th>Start</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{candName(o.candidate_id)}</strong>
                  </td>
                  <td>{jobTitle(o.job_id)}</td>
                  <td>
                    {o.salary ? `${o.currency} ${o.salary.toLocaleString()}` : "—"}
                  </td>
                  <td>{o.start_date ? formatDate(o.start_date) : "—"}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {can(user, "offer:manage") && o.status !== "ACCEPTED" && (
                      <>
                        <button className="btn sm ghost" onClick={() => setStatus(o, "SENT")}>
                          Send
                        </button>
                        <button className="btn sm" onClick={() => setStatus(o, "ACCEPTED")}>
                          Accept
                        </button>
                        <button className="btn sm ghost" onClick={() => setStatus(o, "DECLINED")}>
                          Decline
                        </button>
                        <button className="icon-btn" onClick={() => removeOffer(o)} title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {offers.length === 0 && <Empty title="No offers yet" hint="Create an offer for a candidate." />}
        </div>
      )}

      {tab === "onboarding" && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Task</th>
                <th>Status</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{candName(t.candidate_id)}</td>
                  <td>
                    <button className="flex" style={{ gap: 8, background: "none", border: 0 }} onClick={() => toggleTask(t)}>
                      {t.status === "DONE" ? (
                        <CheckCircle2 size={16} color="#22c55e" />
                      ) : (
                        <Circle size={16} color="#94a3b8" />
                      )}
                      <span style={{ textDecoration: t.status === "DONE" ? "line-through" : "none" }}>
                        {t.title}
                      </span>
                    </button>
                  </td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td>{t.due_date ? formatDate(t.due_date) : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {can(user, "onboarding:manage") && (
                      <button className="icon-btn" onClick={() => removeTask(t)} title="Delete">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && (
            <Empty title="No onboarding tasks" hint="Accepting an offer auto-creates a checklist." />
          )}
        </div>
      )}

      {showOffer && (
        <OfferModal
          candidates={candidates}
          jobs={jobs}
          onClose={() => setShowOffer(false)}
          onSaved={() => {
            setShowOffer(false);
            void load();
          }}
        />
      )}

      {showTask && (
        <TaskModal
          candidates={candidates}
          onClose={() => setShowTask(false)}
          onSaved={() => {
            setShowTask(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function OfferModal({
  candidates,
  jobs,
  onClose,
  onSaved,
}: {
  candidates: Candidate[];
  jobs: Job[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    candidate_id: candidates[0]?.id ?? 0,
    job_id: jobs[0]?.id ?? 0,
    salary: 0,
    currency: "USD",
    employment_type: "FULL_TIME",
    start_date: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.createOffer({
        candidate_id: Number(form.candidate_id),
        job_id: form.job_id ? Number(form.job_id) : null,
        salary: Number(form.salary),
        currency: form.currency,
        employment_type: form.employment_type,
        start_date: form.start_date || null,
        notes: form.notes || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New offer"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !form.candidate_id} onClick={save}>
            {busy ? "Saving…" : "Create"}
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="row">
        <div className="field">
          <label>Candidate</label>
          <select
            value={form.candidate_id}
            onChange={(e) => setForm({ ...form, candidate_id: Number(e.target.value) })}
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Job</label>
          <select value={form.job_id} onChange={(e) => setForm({ ...form, job_id: Number(e.target.value) })}>
            <option value={0}>— none —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Salary</label>
          <input
            type="number"
            value={form.salary}
            onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Currency</label>
          <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Employment type</label>
          <select
            value={form.employment_type}
            onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
          >
            <option value="FULL_TIME">Full time</option>
            <option value="PART_TIME">Part time</option>
            <option value="CONTRACT">Contract</option>
            <option value="INTERNSHIP">Internship</option>
          </select>
        </div>
        <div className="field">
          <label>Start date</label>
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
    </Modal>
  );
}

function TaskModal({
  candidates,
  onClose,
  onSaved,
}: {
  candidates: Candidate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? 0);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.createOnboardingTask({
        candidate_id: Number(candidateId),
        title,
        due_date: dueDate || undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New onboarding task"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !title} onClick={save}>
            {busy ? "Saving…" : "Create"}
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="field">
        <label>Candidate</label>
        <select value={candidateId} onChange={(e) => setCandidateId(Number(e.target.value))}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Task</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sign contract" />
      </div>
      <div className="field">
        <label>Due date</label>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        <Clock size={12} /> Tasks can also be auto-created when an offer is accepted.
      </div>
    </Modal>
  );
}
