import { useCallback, useEffect, useState } from "react";
import { Award, Calendar, CheckCircle2 } from "lucide-react";
import { api } from "../../api";
import { Alert } from "../../components/ui";
import { CandidateDrawer } from "../../components/CandidateDrawer";
import { BulkInterviewModal } from "../../components/BulkInterviewModal";
import { BulkOfferModal } from "../../components/BulkOfferModal";
import { BulkOnboardingModal } from "../../components/BulkOnboardingModal";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import { PIPELINE_STAGES, stageColor, stageLabel } from "../../lib/format";
import type { Candidate, Job, Tag } from "../../types";

export function PipelinePage() {
  const { user } = useAuth();
  const editable = can(user, "pipeline:manage");
  const canInterview = can(user, "interview:manage");
  const canOffer = can(user, "offer:manage");
  const canOnboard = can(user, "onboarding:manage");
  const canBulkAct = canInterview || canOffer || canOnboard || editable;

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showBulkInterview, setShowBulkInterview] = useState(false);
  const [showBulkOffer, setShowBulkOffer] = useState(false);
  const [showBulkOnboard, setShowBulkOnboard] = useState(false);

  const selectedCandidates = candidates.filter((c) => selectedIds.includes(c.id));

  const load = useCallback(async () => {
    try {
      const [c, j, t] = await Promise.all([api.listCandidates(), api.listJobs(), api.listTags()]);
      setCandidates(c);
      setJobs(j);
      setTags(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(id: number, stage: string) {
    const prev = candidates;
    setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, stage: stage as Candidate["stage"] } : c)));
    try {
      await api.setStage(id, stage);
    } catch (e) {
      setCandidates(prev);
      setError(e instanceof Error ? e.message : "Could not move candidate");
    }
  }

  async function handleBulkMoveStage(newStage: string) {
    if (!newStage || selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map((cid) => api.setStage(cid, newStage)));
      setNotice(`Moved ${selectedIds.length} candidate(s) to ${stageLabel(newStage)}.`);
      setSelectedIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move candidates");
    }
  }

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <div className="sub">
            {editable ? "Drag cards between stages to advance the recruitment flow." : "Read-only view."}
          </div>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            padding: "10px 16px",
            background: "rgba(14, 165, 233, 0.08)",
            border: "1px solid rgba(14, 165, 233, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ fontWeight: 650, color: "var(--brand, #0284c7)" }}>
              {selectedIds.length} candidate{selectedIds.length > 1 ? "s" : ""} selected
            </span>
            <button
              className="btn sm ghost"
              style={{ padding: "2px 8px", fontSize: 12 }}
              onClick={() => setSelectedIds([])}
            >
              Deselect
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {canInterview && (
              <button
                className="btn sm primary"
                onClick={() => setShowBulkInterview(true)}
                title="Schedule interview for selected candidates"
              >
                <Calendar size={14} /> Schedule Interview ({selectedIds.length})
              </button>
            )}

            {canOffer && (
              <button
                className="btn sm secondary"
                onClick={() => setShowBulkOffer(true)}
                title="Create offers for selected candidates"
              >
                <Award size={14} /> Make Offer ({selectedIds.length})
              </button>
            )}

            {canOnboard && (
              <button
                className="btn sm secondary"
                onClick={() => setShowBulkOnboard(true)}
                title="Start onboarding for selected candidates"
              >
                <CheckCircle2 size={14} /> Start Onboarding ({selectedIds.length})
              </button>
            )}

            {editable && (
              <select
                style={{ fontSize: 12, padding: "5px 8px" }}
                onChange={(e) => {
                  if (e.target.value) {
                    void handleBulkMoveStage(e.target.value);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>Move to stage…</option>
                {PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    Move to {stageLabel(s)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {loading && <div className="card muted">Loading pipeline…</div>}
      <div className="board" style={{ display: loading ? "none" : undefined }}>
        {PIPELINE_STAGES.map((stage) => {
          const items = candidates.filter((c) => c.stage === stage);
          return (
            <div
              key={stage}
              className="column"
              onDragOver={(e) => {
                if (!editable) return;
                e.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={() => {
                if (!editable) return;
                if (dragId != null) void move(dragId, stage);
                setDragId(null);
                setOverStage(null);
              }}
              style={{
                outline: overStage === stage ? "2px dashed var(--brand)" : "none",
                outlineOffset: 2,
              }}
            >
              <div className="column-head">
                <span className="flex" style={{ gap: 8 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: stageColor(stage),
                    }}
                  />
                  {stageLabel(stage)}
                </span>
                <span className="count">{items.length}</span>
              </div>

              {items.map((c) => (
                <div
                  key={c.id}
                  className="mini-card"
                  draggable={editable}
                  onDragStart={() => setDragId(c.id)}
                  onClick={() => setSelected(c.id)}
                  style={{
                    borderColor: selectedIds.includes(c.id) ? "var(--brand, #0284c7)" : undefined,
                    background: selectedIds.includes(c.id) ? "rgba(14, 165, 233, 0.08)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                    <div className="name">{c.name}</div>
                    {canBulkAct && (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedIds((prev) =>
                            prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                          );
                        }}
                        style={{ cursor: "pointer", width: 15, height: 15 }}
                        title="Select candidate"
                      />
                    )}
                  </div>
                  <div className="meta">{c.current_title ?? "—"}</div>
                  <div className="meta">
                    {c.experience_years}y · {c.skills.slice(0, 2).join(", ") || "no skills"}
                  </div>
                  {editable && (
                    <select
                      value={c.stage}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => move(c.id, e.target.value)}
                    >
                      {PIPELINE_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {stageLabel(s)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

              {items.length === 0 && (
                <div className="muted" style={{ padding: "10px 6px", fontSize: 12.5 }}>
                  Empty
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected !== null && (
        <CandidateDrawer
          candidateId={selected}
          jobs={jobs}
          allTags={tags}
          canEdit={can(user, "candidate:edit")}
          canDelete={can(user, "candidate:delete")}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
        />
      )}

      {showBulkInterview && (
        <BulkInterviewModal
          selectedCandidates={selectedCandidates}
          jobs={jobs}
          onClose={() => setShowBulkInterview(false)}
          onSaved={(count) => {
            setShowBulkInterview(false);
            setNotice(`Successfully scheduled interviews for ${count} candidate(s).`);
            setSelectedIds([]);
            void load();
          }}
        />
      )}

      {showBulkOffer && (
        <BulkOfferModal
          selectedCandidates={selectedCandidates}
          jobs={jobs}
          onClose={() => setShowBulkOffer(false)}
          onSaved={(count) => {
            setShowBulkOffer(false);
            setNotice(`Successfully generated offers for ${count} candidate(s).`);
            setSelectedIds([]);
            void load();
          }}
        />
      )}

      {showBulkOnboard && (
        <BulkOnboardingModal
          selectedCandidates={selectedCandidates}
          onClose={() => setShowBulkOnboard(false)}
          onSaved={(count) => {
            setShowBulkOnboard(false);
            setNotice(`Successfully assigned onboarding tasks for ${count} candidate(s).`);
            setSelectedIds([]);
            void load();
          }}
        />
      )}
    </>
  );
}
