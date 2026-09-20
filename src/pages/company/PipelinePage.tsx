import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { Alert } from "../../components/ui";
import { CandidateDrawer } from "../../components/CandidateDrawer";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import { PIPELINE_STAGES, stageColor, stageLabel } from "../../lib/format";
import type { Candidate, Job, Tag } from "../../types";

export function PipelinePage() {
  const { user } = useAuth();
  const editable = can(user, "pipeline:manage");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, j, t] = await Promise.all([api.listCandidates(), api.listJobs(), api.listTags()]);
      setCandidates(c);
      setJobs(j);
      setTags(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
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

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}

      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <div className="sub">
            {editable ? "Drag cards between stages to advance the recruitment flow." : "Read-only view."}
          </div>
        </div>
      </div>

      <div className="board">
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
                >
                  <div className="name">{c.name}</div>
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
    </>
  );
}