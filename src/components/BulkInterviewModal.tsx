import { useState } from "react";
import { Calendar, Users } from "lucide-react";
import { api } from "../api";
import { Alert, Modal } from "./ui";
import type { Candidate, Job } from "../types";

export function BulkInterviewModal({
  selectedCandidates,
  jobs,
  onClose,
  onSaved,
}: {
  selectedCandidates: Candidate[];
  jobs: Job[];
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [form, setForm] = useState({
    job_id: jobs[0]?.id ? String(jobs[0].id) : "",
    title: "Technical Interview",
    scheduled_at: "",
    duration_minutes: 60,
    mode: "VIDEO",
    location: "Google Meet",
    advance_stage: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSchedule() {
    if (selectedCandidates.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.bulkCreateInterviews({
        candidate_ids: selectedCandidates.map((c) => c.id),
        job_id: form.job_id ? Number(form.job_id) : null,
        title: form.title.trim() || "Interview",
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        duration_minutes: Number(form.duration_minutes),
        mode: form.mode,
        location: form.location.trim() || null,
        advance_stage: form.advance_stage,
      });
      onSaved(res.created_count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to schedule interviews in bulk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Schedule Bulk Interview (${selectedCandidates.length} Candidates)`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || selectedCandidates.length === 0}
            onClick={handleSchedule}
          >
            <Calendar size={15} />
            {busy ? "Scheduling…" : `Schedule for ${selectedCandidates.length} candidate(s)`}
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
          <Users size={16} /> Selected Candidates ({selectedCandidates.length})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 90, overflowY: "auto", padding: "6px 8px", background: "var(--card-subtle, rgba(0,0,0,0.03))", borderRadius: 6 }}>
          {selectedCandidates.map((c) => (
            <span key={c.id} className="pill" style={{ fontWeight: 500 }}>
              {c.name}
            </span>
          ))}
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Target Job</label>
          <select
            value={form.job_id}
            onChange={(e) => setForm({ ...form, job_id: e.target.value })}
          >
            <option value="">No specific job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} {j.status !== "OPEN" ? `(${j.status})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Interview Round / Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Technical Round 1"
          />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Date & Time</label>
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Duration</label>
          <select
            value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
          >
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Interview Mode</label>
          <select
            value={form.mode}
            onChange={(e) => setForm({ ...form, mode: e.target.value })}
          >
            <option value="VIDEO">Video Call</option>
            <option value="PHONE">Phone Call</option>
            <option value="ONSITE">On-Site</option>
          </select>
        </div>

        <div className="field">
          <label>Location / Meeting Link</label>
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="e.g. Google Meet or Conference Room"
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.advance_stage}
            onChange={(e) => setForm({ ...form, advance_stage: e.target.checked })}
          />
          Automatically advance candidates to <strong>Interview</strong> stage
        </label>
      </div>
    </Modal>
  );
}
