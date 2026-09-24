import { useEffect, useState } from "react";
import { Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, Modal, StatusBadge } from "../../components/ui";
import { VacancyBroadcastModal } from "../../components/VacancyBroadcastModal";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import { formatDate } from "../../lib/format";
import type { Job } from "../../types";

const EMPTY = {
  title: "",
  client_name: "",
  department: "",
  location: "",
  employment_type: "Full-time",
  status: "OPEN",
  salary_range: "",
  requirements: "",
  skills: "",
};

export function JobsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [broadcastJob, setBroadcastJob] = useState<Job | null>(null);

  const canBroadcast = can(user, "email:manage") || user?.role === "MASTER_ADMIN" || user?.role === "COMPANY_OWNER" || user?.role === "COMPANY_ADMIN" || user?.role === "RECRUITER";

  async function load() {
    try {
      setJobs(await api.listJobs());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(job: Job) {
    if (!confirm(`Delete job "${job.title}"?`)) return;
    await api.deleteJob(job.id);
    await load();
  }

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <div className="sub">Define requirements, then match against your talent database.</div>
        </div>
        {can(user, "job:create") && (
          <button
            className="btn primary"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus size={16} /> Create job
          </button>
        )}
      </div>

      <div className="grid cols-3">
        {jobs.map((j) => (
          <div className="card" key={j.id}>
            <div className="flex between">
              <h3>{j.title}</h3>
              <StatusBadge status={j.status} />
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
              {[j.client_name, j.department, j.location].filter(Boolean).join(" · ") || "No details"}
            </div>
            <div className="flex wrap" style={{ gap: 4 }}>
              {j.skills.slice(0, 6).map((s) => (
                <span className="pill" key={s}>
                  {s}
                </span>
              ))}
            </div>
            <div className="flex between mt-2">
              <span className="muted" style={{ fontSize: 12 }}>
                Created {formatDate(j.created_at)}
              </span>
              <span className="flex" style={{ gap: 4 }}>
                {canBroadcast && j.status === "OPEN" && (
                  <button
                    className="btn sm secondary"
                    onClick={() => setBroadcastJob(j)}
                    title="Broadcast vacancy announcement to matching or all candidates"
                  >
                    <Send size={13} /> Announce
                  </button>
                )}
                {can(user, "job:edit") && (
                  <button
                    className="btn sm ghost"
                    onClick={() => {
                      setEditing(j);
                      setShowForm(true);
                    }}
                  >
                    Edit
                  </button>
                )}
                {can(user, "job:delete") && (
                  <button className="icon-btn" onClick={() => remove(j)} title="Delete">
                    <Trash2 size={15} />
                  </button>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      {jobs.length === 0 && (
        <div className="card">
          <Empty title="No jobs yet" hint="Create a job to start matching candidates." />
        </div>
      )}

      {showForm && (
        <JobModal
          job={editing}
          onClose={() => setShowForm(false)}
          onSaved={(created) => {
            setShowForm(false);
            if (created?.rediscovered_candidate_count) {
              setNotice(
                `Job created. Rediscovered ${created.rediscovered_candidate_count} existing candidate(s) in your talent database.`,
              );
            }
            void load();
          }}
        />
      )}

      {broadcastJob && (
        <VacancyBroadcastModal
          jobs={jobs}
          defaultJobId={broadcastJob.id}
          onClose={() => setBroadcastJob(null)}
          onBroadcastSent={() => {
            setNotice(`Vacancy announcement for "${broadcastJob.title}" broadcast sent successfully!`);
          }}
        />
      )}
    </>
  );
}

function JobModal({
  job,
  onClose,
  onSaved,
}: {
  job: Job | null;
  onClose: () => void;
  onSaved: (created?: Job) => void;
}) {
  const [form, setForm] = useState({
    ...EMPTY,
    ...(job
      ? {
          title: job.title,
          client_name: job.client_name ?? "",
          department: job.department ?? "",
          location: job.location ?? "",
          employment_type: job.employment_type ?? "Full-time",
          status: job.status,
          salary_range: job.salary_range ?? "",
          requirements: job.requirements ?? "",
          skills: job.skills.join(", "),
        }
      : {}),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      title: form.title,
      client_name: form.client_name || null,
      department: form.department || null,
      location: form.location || null,
      employment_type: form.employment_type || null,
      status: form.status,
      salary_range: form.salary_range || null,
      requirements: form.requirements || null,
      skills: form.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      const res = job
        ? await api.updateJob(job.id, payload as Partial<Job> & { title: string })
        : await api.createJob(payload as Partial<Job> & { title: string });
      onSaved(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title={job ? "Edit job" : "Create job"}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !form.title} onClick={save}>
            {busy ? "Saving…" : job ? "Save changes" : "Create job"}
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="row">
        <div className="field">
          <label>Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Client</label>
          <input
            value={form.client_name}
            onChange={(e) => setForm({ ...form, client_name: e.target.value })}
            placeholder="Agency client (optional)"
          />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Department</label>
          <input
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Location</label>
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Employment type</label>
          <input
            value={form.employment_type}
            onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="DRAFT">Draft</option>
            <option value="OPEN">Open</option>
            <option value="ON_HOLD">On hold</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <div className="field">
          <label>Salary range</label>
          <input
            value={form.salary_range}
            onChange={(e) => setForm({ ...form, salary_range: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Skills (comma separated)</label>
        <input
          value={form.skills}
          onChange={(e) => setForm({ ...form, skills: e.target.value })}
          placeholder="python, react, kubernetes"
        />
        <div className="muted mt-2" style={{ fontSize: 12.5 }}>
          <Sparkles size={13} /> On save we rediscover matching candidates already in your database.
        </div>
      </div>
      <div className="field">
        <label>Requirements</label>
        <textarea
          rows={4}
          value={form.requirements}
          onChange={(e) => setForm({ ...form, requirements: e.target.value })}
        />
      </div>
    </Modal>
  );
}