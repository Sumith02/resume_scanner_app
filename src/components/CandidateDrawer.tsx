import { useEffect, useState } from "react";
import { Check, Copy, Download, Mail, MapPin, Pencil, Phone, Sparkles, Trash2 } from "lucide-react";
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
  const [copied, setCopied] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  function copySummary() {
    if (!cand?.summary) return;
    void navigator.clipboard.writeText(cand.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function load() {
    try {
      const [c, n] = await Promise.all([api.getCandidate(candidateId), api.listNotes(candidateId)]);
      setCand(c);
      setLocationInput(c.location || "");
      setNotes(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candidate");
    }
  }

  async function saveLocation() {
    if (!cand) return;
    setSavingLocation(true);
    try {
      const updated = await api.patchCandidate(cand.id, { location: locationInput.trim() });
      setCand(updated);
      setEditingLocation(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update location");
    } finally {
      setSavingLocation(false);
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
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div className="flex" style={{ gap: 8, alignItems: "center" }}>
                  <MapPin size={14} className={cand.location ? "" : "muted"} />
                  {cand.location ? (
                    <span style={{ fontWeight: 550 }}>{cand.location}</span>
                  ) : (
                    <span className="muted" style={{ fontStyle: "italic" }}>Location not detected</span>
                  )}
                  {canEdit && !editingLocation && (
                    <button
                      className="btn sm ghost"
                      style={{ padding: "1px 6px", fontSize: 11, height: "auto", marginLeft: 4 }}
                      onClick={() => {
                        setLocationInput(cand.location || "");
                        setEditingLocation(true);
                      }}
                      title="Edit candidate location"
                    >
                      <Pencil size={11} /> {cand.location ? "Edit" : "Set"}
                    </button>
                  )}
                </div>
                {editingLocation && (
                  <div className="flex" style={{ gap: 6, marginTop: 4 }}>
                    <input
                      type="text"
                      value={locationInput}
                      onChange={(e) => setLocationInput(e.target.value)}
                      placeholder="e.g. Bengaluru, India"
                      style={{ fontSize: 12, padding: "3px 8px", width: 170 }}
                      autoFocus
                      disabled={savingLocation}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveLocation();
                        if (e.key === "Escape") setEditingLocation(false);
                      }}
                    />
                    <button
                      className="btn sm primary"
                      style={{ padding: "3px 8px", fontSize: 11 }}
                      disabled={savingLocation}
                      onClick={() => void saveLocation()}
                    >
                      {savingLocation ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="btn sm ghost"
                      style={{ padding: "3px 8px", fontSize: 11 }}
                      disabled={savingLocation}
                      onClick={() => setEditingLocation(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
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
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  background: "linear-gradient(135deg, rgba(37,99,235,0.08), rgba(99,102,241,0.05))",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles size={16} color="var(--primary)" />
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>Professional Summary</span>
                </div>
                {cand.summary && (
                  <button
                    type="button"
                    className="btn sm ghost"
                    style={{ fontSize: 11.5, padding: "2px 8px", height: 26 }}
                    onClick={copySummary}
                    title="Copy summary to clipboard"
                  >
                    {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                    <span style={{ marginLeft: 4 }}>{copied ? "Copied" : "Copy"}</span>
                  </button>
                )}
              </div>

              {/* Quick Profile Highlights Banner */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                  gap: 8,
                  padding: "10px 14px",
                  background: "#fcfdff",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 12,
                }}
              >
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11 }}>Role</span>
                  <strong>{cand.current_title || "Candidate"}</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11 }}>Experience</span>
                  <strong>{cand.experience_years ? `${cand.experience_years} Years` : "Experienced"}</strong>
                </div>
                {cand.location && (
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 11 }}>Location</span>
                    <strong>{cand.location}</strong>
                  </div>
                )}
              </div>

              {/* Formatted Summary Content */}
              <div
                style={{
                  padding: 14,
                  fontSize: 13,
                  lineHeight: 1.6,
                  maxHeight: 250,
                  overflowY: "auto",
                  color: "#334155",
                }}
              >
                {cand.summary ? (
                  cand.summary.includes("\n- ") || cand.summary.includes("\n* ") || cand.summary.includes("\n• ") ? (
                    <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                      {cand.summary
                        .split(/\n[-*•]\s+/)
                        .filter(Boolean)
                        .map((bullet, idx) => (
                          <li key={idx}>{bullet.trim()}</li>
                        ))}
                    </ul>
                  ) : (
                    cand.summary.split("\n\n").map((para, idx) => (
                      <p key={idx} style={{ margin: idx === 0 ? 0 : "8px 0 0 0" }}>
                        {para.trim()}
                      </p>
                    ))
                  )
                ) : (
                  <span className="muted">No summary extracted or provided yet.</span>
                )}
              </div>
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