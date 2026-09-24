import { useState } from "react";
import { CheckCircle2, ListChecks, Users } from "lucide-react";
import { api } from "../api";
import { Alert, Modal } from "./ui";
import type { Candidate } from "../types";

const STANDARD_PACK = [
  "Sign Offer Letter & Employment Agreement",
  "Submit Identity Verification & Tax Forms",
  "IT Equipment & Workstation Provisioning",
  "Company Overview & Team Orientation",
];

export function BulkOnboardingModal({
  selectedCandidates,
  onClose,
  onSaved,
}: {
  selectedCandidates: Candidate[];
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [mode, setMode] = useState<"pack" | "custom">("pack");
  const [selectedTasks, setSelectedTasks] = useState<string[]>(STANDARD_PACK);
  const [customTitle, setCustomTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [advanceStage, setAdvanceStage] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleTask(t: string) {
    setSelectedTasks((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  async function handleStartOnboarding() {
    if (selectedCandidates.length === 0) return;
    setBusy(true);
    setError(null);

    const taskItems =
      mode === "pack"
        ? selectedTasks.map((title) => ({
            title,
            due_date: dueDate ? new Date(dueDate).toISOString() : null,
          }))
        : customTitle.trim()
          ? [{
              title: customTitle.trim(),
              due_date: dueDate ? new Date(dueDate).toISOString() : null,
            }]
          : [];

    if (taskItems.length === 0) {
      setError("Please select at least one task or enter a task name.");
      setBusy(false);
      return;
    }

    try {
      const res = await api.bulkCreateOnboarding({
        candidate_ids: selectedCandidates.map((c) => c.id),
        tasks: taskItems,
        advance_stage: advanceStage,
      });
      onSaved(res.created_count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start onboarding in bulk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Start Bulk Onboarding (${selectedCandidates.length} Candidates)`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || selectedCandidates.length === 0}
            onClick={handleStartOnboarding}
          >
            <CheckCircle2 size={15} />
            {busy ? "Starting…" : `Start Onboarding (${selectedCandidates.length} Candidates)`}
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

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button
          className={mode === "pack" ? "active" : ""}
          onClick={() => setMode("pack")}
          type="button"
        >
          <ListChecks size={14} style={{ marginRight: 6 }} /> Standard Checklist
        </button>
        <button
          className={mode === "custom" ? "active" : ""}
          onClick={() => setMode("custom")}
          type="button"
        >
          Custom Task
        </button>
      </div>

      {mode === "pack" ? (
        <div className="field">
          <label style={{ marginBottom: 8, display: "block" }}>Tasks to assign per candidate</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {STANDARD_PACK.map((task) => (
              <label
                key={task}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  padding: "6px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: selectedTasks.includes(task) ? "rgba(14, 165, 233, 0.05)" : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedTasks.includes(task)}
                  onChange={() => toggleTask(task)}
                />
                <span>{task}</span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="field">
          <label>Task Title</label>
          <input
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="e.g. Complete background check & security training"
          />
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <label>Target Due Date (Optional)</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={advanceStage}
            onChange={(e) => setAdvanceStage(e.target.checked)}
          />
          Automatically advance candidates to <strong>Onboarding</strong> stage
        </label>
      </div>
    </Modal>
  );
}
