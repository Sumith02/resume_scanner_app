import { useEffect, useState } from "react";
import { Download, Mail, MapPin, Phone, Trash2 } from "lucide-react";
import { api, apiUrl } from "../api";
import { Alert, Modal, StageBadge } from "./ui";
import { PIPELINE_STAGES, formatDate, initials, stageLabel } from "../lib/format";
import type { Candidate, Job, Note, Tag } from "../types";

export function CandidateDrawer({
  candidateId,
  jobs,
  allTags,
  canEdit,
  canDelete,
  onClose,
  onChanged,
}: {
  candidateId: number;
  jobs: Job[];
  allTags: Tag[];
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [cand, setCand] = useState<Candidate | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [c, n] = await Promise.all([api.getCandidate(candidateId), api.listNotes(candidateId)]);
      setCand(c);
      setNotes(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candidate");
    }
  }

  useEffect(() => {
    void load();
  }, [candidateId]);

  async function changeStage(stage: string) {
    if (!cand) return;
    const updated = await api.setStage(cand.id, stage);
    setCand(updated);
    onChanged();
  }

  async function toggleTag(tag: Tag) {
    if (!cand) return;
    const has = cand.tags.some((t) => t.id === tag.id);
    const updated = await api.patchCandidateTags(cand.id, has ? [] : [tag.id], has ? [tag.id] : []);
    setCand(updated);
    onChanged();
  }

  async function toggleJob(job: Job) {
    if (!cand) return;
    const has = cand.matched_job_ids.includes(job.id);
    const updated = await api.patchCandidateJobs(
      cand.id,
      has ? [] : [job.id],
      has ? [job.id] : [],
    );
    setCand(updated);
  }

  async function addNote() {
    if (!noteText.trim()) return;
    await api.addNote(candidateId, noteText.trim());
    setNoteText("");
    setNotes(await api.listNotes(candidateId));
  }

  async function remove() {
    if (!cand) return;
    if (!confirm(`Delete ${cand.name}? This cannot be undone.`)) return;
    await api.deleteCandidate(cand.id);
    onChanged();
    onClose();
  }

  return (
    <Modal
      wide
      title={cand ? cand.name : "Candidate"}
      onClose={onClose}
      footer={
        canDelete ? (
          <button className="btn danger" onClick={remove}>
            <Trash2 size={15} /> Delete candidate
          </button>
        ) : null
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      {!cand ? (
        <div className="muted">Loading profile…</div>
      ) : (
        <div className="grid cols-2">
          <div>
            <div className="flex" style={{ gap: 12 }}>
              <div className="avatar" style={{ width: 48, height: 48, fontSize: 16 }}>
                {initials(cand.name)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{cand.name}</div>
                <div className="muted">
                  {cand.current_title ?? "—"}
                  {cand.current_company ? ` · ${cand.current_company}` : ""}
                </div>
              </div>
            </div>

            <div className="mt-2" style={{ display: "grid", gap: 6, fontSize: 13 }}>
              {cand.email && (
                <span className="flex" style={{ gap: 8 }}>
                  <Mail size={14} /> {cand.email}
                </span>
              )}
              {cand.phone && (
                <span className="flex" style={{ gap: 8 }}>
                  <Phone size={14} /> {cand.phone}
                </span>
              )}
              {cand.location && (
                <span className="flex" style={{ gap: 8 }}>
                  <MapPin size={14} /> {cand.location}
                </span>
              )}
            </div>

            <div className="flex wrap mt-2" style={{ gap: 8 }}>
              <StageBadge stage={cand.stage} />
              <span className="badge">{cand.experience_years} yrs exp</span>
              <span className="badge">Source: {cand.source}</span>
              {cand.duplicate_of_id && <span className="badge" style={{ color: "#b45309" }}>Possible duplicate</span>}
            </div>

            {canEdit && (
              <div className="field mt-2">
                <label>Pipeline stage</label>
                <select value={cand.stage} onChange={(e) => changeStage(e.target.value)}>
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {stageLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-2">
              <div className="flex between">
                <label className="mb-0">Resume</label>
                {cand.has_resume && (
                  <a
                    className="btn sm ghost"
                    href={apiUrl(`/api/org/candidates/${cand.id}/resume`)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      const token = localStorage.getItem("nexerra.token");
                      fetch(apiUrl(`/api/org/candidates/${cand.id}/resume`), {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                      })
                        .then((r) => r.blob())
                        .then((b) => {
                          const url = URL.createObjectURL(b);
                          window.open(url, "_blank");
                        });
                    }}
                  >
                    <Download size={14} /> {cand.resume_filename ?? "Download"}
                  </a>
                )}
              </div>
              {!cand.has_resume && <div className="muted">No file on record (manual entry).</div>}
            </div>

            <div className="mt-2">
              <label>Skills</label>
              <div className="flex wrap" style={{ gap: 4 }}>
                {cand.skills.length ? (
                  cand.skills.map((s) => (
                    <span key={s} className="pill">
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="muted">No skills extracted.</span>
                )}
              </div>
            </div>

            <div className="mt-2">
              <label>Tags</label>
              <div className="flex wrap" style={{ gap: 4 }}>
                {allTags.map((t) => {
                  const active = cand.tags.some((x) => x.id === t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="pill"
                      disabled={!canEdit}
                      onClick={() => toggleTag(t)}
                      style={{
                        cursor: canEdit ? "pointer" : "default",
                        background: active ? t.color + "22" : undefined,
                        borderColor: active ? t.color : undefined,
                        color: active ? t.color : undefined,
                        fontWeight: active ? 700 : 400,
                      }}
                    >
                      {t.name}
                    </button>
                  );
                })}
                {allTags.length === 0 && <span className="muted">No tags defined yet.</span>}
              </div>
            </div>

            <div className="mt-2">
              <label>Matched jobs</label>
              <div style={{ display: "grid", gap: 4 }}>
                {jobs.slice(0, 8).map((j) => {
                  const active = cand.matched_job_ids.includes(j.id);
                  return (
                    <label key={j.id} className="flex" style={{ gap: 8, fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        style={{ width: 16 }}
                        checked={active}
                        disabled={!canEdit}
                        onChange={() => toggleJob(j)}
                      />
                      {j.title}
                      <span className="muted">· {j.status}</span>
                    </label>
                  );
                })}
                {jobs.length === 0 && <span className="muted">No jobs created yet.</span>}
              </div>
            </div>
          </div>

          <div>
            <label>Summary</label>
            <div
              style={{
                background: "var(--surface-2)",
                borderRadius: 10,
                padding: 12,
                fontSize: 13,
                maxHeight: 220,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {cand.summary || "No summary available."}
            </div>

            <div className="mt-2">
              <label>Notes</label>
              <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                {notes.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      background: "#fafbfe",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <div className="flex between">
                      <strong style={{ fontSize: 12.5 }}>{n.author_name ?? "User"}</strong>
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        {formatDate(n.created_at)}
                      </span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>{n.body}</div>
                  </div>
                ))}
                {notes.length === 0 && <div className="muted">No notes yet.</div>}
              </div>
              {canEdit && (
                <div className="mt-2">
                  <textarea
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note…"
                  />
                  <button className="btn sm primary mt-2" onClick={addNote} disabled={!noteText.trim()}>
                    Add note
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}