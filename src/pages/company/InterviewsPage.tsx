import { useEffect, useState } from "react";
import { CalendarClock, Plus, Star, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, Modal, StatusBadge } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import { formatDate } from "../../lib/format";
import type { Candidate, Interview, Job, Scorecard } from "../../types";

export function InterviewsPage() {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<Interview | null>(null);

  const candName = (id: number | null) =>
    candidates.find((c) => c.id === id)?.name ?? `Candidate #${id ?? "?"}`;
  const jobTitle = (id: number | null) =>
    id ? jobs.find((j) => j.id === id)?.title ?? `Job #${id}` : "—";

  async function load() {
    try {
      const [iv, c, j] = await Promise.all([
        api.listInterviews(),
        api.listCandidates({ limit: 200 }),
        api.listJobs(),
      ]);
      setInterviews(iv);
      setCandidates(c);
      setJobs(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load interviews");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(iv: Interview) {
    if (!confirm("Delete this interview?")) return;
    await api.deleteInterview(iv.id);
    await load();
  }

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}

      <div className="page-head">
        <div>
          <h1>Interviews</h1>
          <div className="sub">Schedule interviews and collect structured scorecards.</div>
        </div>
        {can(user, "interview:manage") && (
          <button className="btn primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Schedule interview
          </button>
        )}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Job</th>
              <th>When</th>
              <th>Mode</th>
              <th>Status</th>
              <th>Rating</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {interviews.map((iv) => (
              <tr key={iv.id}>
                <td>
                  <strong>{candName(iv.candidate_id)}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>{iv.title || "Interview"}</div>
                </td>
                <td>{jobTitle(iv.job_id)}</td>
                <td>{iv.scheduled_at ? formatDate(iv.scheduled_at) : "Unscheduled"}</td>
                <td>{iv.mode}</td>
                <td>
                  <StatusBadge status={iv.status} />
                </td>
                <td>
                  {iv.average_rating ? (
                    <span className="flex" style={{ gap: 4 }}>
                      <Star size={13} /> {iv.average_rating}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn sm ghost" onClick={() => setDetail(iv)}>
                    Open
                  </button>
                  {can(user, "interview:manage") && (
                    <button className="icon-btn" onClick={() => remove(iv)} title="Delete">
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {interviews.length === 0 && (
          <Empty title="No interviews scheduled" hint="Schedule one from a candidate or here." />
        )}
      </div>

      {showForm && (
        <InterviewModal
          candidates={candidates}
          jobs={jobs}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      {detail && (
        <InterviewDetail
          interview={detail}
          candidateName={candName(detail.candidate_id)}
          onClose={() => setDetail(null)}
          onChanged={async () => {
            await load();
            const fresh = await api.getInterview(detail.id);
            setDetail(fresh);
          }}
        />
      )}
    </>
  );
}

function InterviewModal({
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
    title: "Interview",
    scheduled_at: "",
    duration_minutes: 60,
    mode: "VIDEO",
    location: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.createInterview({
        candidate_id: Number(form.candidate_id),
        job_id: form.job_id ? Number(form.job_id) : null,
        title: form.title,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        duration_minutes: Number(form.duration_minutes),
        mode: form.mode as Interview["mode"],
        location: form.location || null,
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
      title="Schedule interview"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !form.candidate_id} onClick={save}>
            {busy ? "Saving…" : "Schedule"}
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
          <label>Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label>When</label>
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
          />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Mode</label>
          <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="VIDEO">Video</option>
            <option value="ONSITE">Onsite</option>
            <option value="PHONE">Phone</option>
          </select>
        </div>
        <div className="field">
          <label>Duration (minutes)</label>
          <input
            type="number"
            value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="field">
        <label>Location / link</label>
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      </div>
    </Modal>
  );
}

function InterviewDetail({
  interview,
  candidateName,
  onClose,
  onChanged,
}: {
  interview: Interview;
  candidateName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [card, setCard] = useState({ technical: 3, communication: 3, culture_fit: 3, overall: 3, recommendation: "HIRE", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.submitScorecard(interview.id, card);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  }

  const scorecards: Scorecard[] = interview.scorecards ?? [];

  return (
    <Modal
      wide
      title={`Interview · ${candidateName}`}
      onClose={onClose}
      footer={
        <button className="btn ghost" onClick={onClose}>
          Done
        </button>
      }
    >
      <Alert kind="info">
        <CalendarClock size={13} /> {interview.title} · {interview.mode} ·{" "}
        {interview.scheduled_at ? formatDate(interview.scheduled_at) : "Unscheduled"}
      </Alert>

      {error && <Alert kind="error">{error}</Alert>}

      <h3>Scorecards ({scorecards.length})</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Technical</th>
              <th>Communication</th>
              <th>Culture fit</th>
              <th>Overall</th>
              <th>Recommendation</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {scorecards.map((s) => (
              <tr key={s.id}>
                <td>{s.technical ?? "—"}</td>
                <td>{s.communication ?? "—"}</td>
                <td>{s.culture_fit ?? "—"}</td>
                <td>
                  <strong>{s.overall ?? "—"}</strong>
                </td>
                <td>{s.recommendation || "—"}</td>
                <td className="muted">{s.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {scorecards.length === 0 && <Empty title="No feedback yet" />}
      </div>

      {can(user, "scorecard:submit") && (
        <>
          <h3 className="mt-2">Add scorecard</h3>
          <div className="grid cols-4">
            {(["technical", "communication", "culture_fit", "overall"] as const).map((k) => (
              <div className="field" key={k}>
                <label>{k.replace("_", " ")} (1-5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={card[k]}
                  onChange={(e) => setCard({ ...card, [k]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
          <div className="row">
            <div className="field">
              <label>Recommendation</label>
              <select
                value={card.recommendation}
                onChange={(e) => setCard({ ...card, recommendation: e.target.value })}
              >
                <option value="STRONG_HIRE">Strong hire</option>
                <option value="HIRE">Hire</option>
                <option value="NO_HIRE">No hire</option>
                <option value="STRONG_NO_HIRE">Strong no hire</option>
              </select>
            </div>
            <div className="field">
              <label>Notes</label>
              <input value={card.notes} onChange={(e) => setCard({ ...card, notes: e.target.value })} />
            </div>
          </div>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? "Submitting…" : "Submit scorecard"}
          </button>
        </>
      )}
    </Modal>
  );
}
