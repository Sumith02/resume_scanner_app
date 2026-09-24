import { useState } from "react";
import { Award, Users } from "lucide-react";
import { api } from "../api";
import { Alert, Modal } from "./ui";
import type { Candidate, Job } from "../types";

export function BulkOfferModal({
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
    salary: "",
    currency: "USD",
    employment_type: "FULL_TIME",
    start_date: "",
    notes: "",
    advance_stage: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreateOffers() {
    if (selectedCandidates.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.bulkCreateOffers({
        candidate_ids: selectedCandidates.map((c) => c.id),
        job_id: form.job_id ? Number(form.job_id) : null,
        salary: form.salary ? Number(form.salary) : null,
        currency: form.currency,
        employment_type: form.employment_type,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        notes: form.notes.trim() || null,
        advance_stage: form.advance_stage,
      });
      onSaved(res.created_count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create offers in bulk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Create Bulk Offers (${selectedCandidates.length} Candidates)`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || selectedCandidates.length === 0}
            onClick={handleCreateOffers}
          >
            <Award size={15} />
            {busy ? "Creating…" : `Generate ${selectedCandidates.length} Offer(s)`}
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
          <label>Employment Type</label>
          <select
            value={form.employment_type}
            onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
          >
            <option value="FULL_TIME">Full-time</option>
            <option value="PART_TIME">Part-time</option>
            <option value="CONTRACT">Contract</option>
            <option value="INTERNSHIP">Internship</option>
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Annual / Monthly Salary</label>
          <input
            type="number"
            value={form.salary}
            onChange={(e) => setForm({ ...form, salary: e.target.value })}
            placeholder="e.g. 120000"
          />
        </div>

        <div className="field">
          <label>Currency</label>
          <select
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
            <option value="USD">USD ($)</option>
            <option value="INR">INR (₹)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="CAD">CAD ($)</option>
            <option value="AUD">AUD ($)</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>Expected Start Date</label>
        <input
          type="date"
          value={form.start_date}
          onChange={(e) => setForm({ ...form, start_date: e.target.value })}
        />
      </div>

      <div className="field">
        <label>Offer Terms / Notes</label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Standard benefits package, relocation assistance, vesting schedule, etc."
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.advance_stage}
            onChange={(e) => setForm({ ...form, advance_stage: e.target.checked })}
          />
          Automatically advance candidates to <strong>Offer</strong> stage
        </label>
      </div>
    </Modal>
  );
}
