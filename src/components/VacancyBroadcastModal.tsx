import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Globe, Send, Target, Users } from "lucide-react";
import { api } from "../api";
import { Alert, Modal } from "./ui";
import { initials } from "../lib/format";
import type { Job } from "../types";

interface RecipientPreview {
  id: number;
  name: string;
  email: string;
  current_title?: string;
  skills: string[];
  location?: string;
  stage: string;
  match_reason: string;
}

export function VacancyBroadcastModal({
  jobs,
  defaultJobId,
  onClose,
  onBroadcastSent,
}: {
  jobs: Job[];
  defaultJobId?: number;
  onClose: () => void;
  onBroadcastSent?: () => void;
}) {
  const [selectedJobId, setSelectedJobId] = useState<number>(
    defaultJobId ?? (jobs[0]?.id || 0)
  );
  const [audience, setAudience] = useState<"matching" | "all">("matching");
  const [subject, setSubject] = useState(
    "Exciting Career Opportunity: {{job_title}} at {{company_name}}"
  );
  const [body, setBody] = useState(
`Hi {{candidate_name}},

We have an exciting new opening for {{job_title}} at {{company_name}} in {{location}}! Based on your background and skillset, we thought your profile could be an excellent fit for this position.

Role Overview:
• Position: {{job_title}}
• Department: {{department}}
• Location: {{location}}
• Compensation: {{salary_range}}

Key Requirements & Responsibilities:
{{requirements}}

If you are interested in exploring this role, please reply directly to this email with your updated resume or availability for a quick introductory chat.

Best regards,
The Talent Acquisition Team
{{company_name}}`
  );

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewCandidates, setPreviewCandidates] = useState<RecipientPreview[]>([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);
  const [showRecipients, setShowRecipients] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentResult, setSentResult] = useState<{ sent_count: number; job_title: string; audience: string } | null>(null);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? jobs[0];

  useEffect(() => {
    if (!selectedJobId) return;
    let active = true;
    setLoadingPreview(true);
    setError(null);

    api.getVacancyCandidates(selectedJobId, audience)
      .then((res) => {
        if (!active) return;
        setPreviewCandidates(res.candidates);
        setTotalCandidates(res.total_candidates);
        setSelectedCandidateIds(res.candidates.map((c) => c.id));
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load candidate preview");
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });

    return () => {
      active = false;
    };
  }, [selectedJobId, audience]);

  function toggleCandidate(id: number) {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selectedCandidateIds.length === previewCandidates.length) {
      setSelectedCandidateIds([]);
    } else {
      setSelectedCandidateIds(previewCandidates.map((c) => c.id));
    }
  }

  function insertTag(tag: string) {
    setBody((prev) => prev + " " + tag);
  }

  async function handleBroadcast() {
    if (selectedCandidateIds.length === 0) {
      setError("Please select at least one recipient candidate.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.broadcastVacancy({
        job_id: selectedJobId,
        audience,
        subject,
        body,
        candidate_ids: selectedCandidateIds.length < previewCandidates.length ? selectedCandidateIds : undefined,
      });
      setSentResult(res);
      onBroadcastSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to broadcast vacancy email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title="Announce Job Vacancy to Candidates"
      onClose={onClose}
      footer={
        sentResult ? (
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={busy || loadingPreview || selectedCandidateIds.length === 0}
              onClick={handleBroadcast}
            >
              <Send size={15} />
              {busy
                ? "Sending broadcast…"
                : `Send to ${selectedCandidateIds.length} Candidate${selectedCandidateIds.length === 1 ? "" : "s"}`}
            </button>
          </>
        )
      }
    >
      {error && <Alert kind="error">{error}</Alert>}

      {sentResult ? (
        <Alert kind="success">
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            <CheckCircle2 size={18} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
            Vacancy announcement successfully broadcast!
          </div>
          <div style={{ marginTop: 6, fontSize: 13.5 }}>
            Sent vacancy emails to <strong>{sentResult.sent_count} candidate(s)</strong> for the position{" "}
            <strong>"{sentResult.job_title}"</strong> using audience mode <strong>"{sentResult.audience === "matching" ? "Matching Domain & Skills" : "All Candidates"}"</strong>.
          </div>
        </Alert>
      ) : (
        <>
          {/* Step 1: Select Vacancy / Job */}
          <div className="card" style={{ padding: 14, marginBottom: 16, background: "#fafbfe" }}>
            <div className="flex between" style={{ marginBottom: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  1. Select Open Vacancy
                </label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(Number(e.target.value))}
                  style={{ fontWeight: 600, fontSize: 14 }}
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} {j.department ? `· ${j.department}` : ""} {j.location ? `(${j.location})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedJob && (
              <div className="flex wrap" style={{ gap: 6, marginTop: 8, fontSize: 12 }}>
                {selectedJob.department && (
                  <span className="badge">Department: {selectedJob.department}</span>
                )}
                {selectedJob.location && (
                  <span className="badge">📍 {selectedJob.location}</span>
                )}
                {selectedJob.salary_range && (
                  <span className="badge">💰 {selectedJob.salary_range}</span>
                )}
                {selectedJob.skills && selectedJob.skills.length > 0 && (
                  <div className="flex wrap" style={{ gap: 4, marginLeft: 4 }}>
                    <span className="muted">Required Skills:</span>
                    {selectedJob.skills.slice(0, 6).map((s) => (
                      <span key={s} className="pill" style={{ fontSize: 11 }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Target Audience Options (Major Feature) */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 8 }}>
              2. Target Candidate Audience
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Option A: Matching Domain & Skills */}
              <div
                onClick={() => setAudience("matching")}
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: audience === "matching" ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: audience === "matching" ? "rgba(37,99,235,0.05)" : "#fff",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div className="flex between" style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
                    <Target size={18} color="var(--primary)" />
                    Matching Domain & Skills
                  </div>
                  <input
                    type="radio"
                    name="audience"
                    checked={audience === "matching"}
                    onChange={() => setAudience("matching")}
                    style={{ width: 16, height: 16 }}
                  />
                </div>
                <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                  Target only candidates whose extracted skills, domain title, or previous matching align with{" "}
                  <strong>{selectedJob?.title || "this job"}</strong>.
                </div>
                <div style={{ marginTop: 8 }}>
                  <span
                    className="badge"
                    style={{
                      background: audience === "matching" ? "rgba(37,99,235,0.15)" : undefined,
                      color: audience === "matching" ? "var(--primary)" : undefined,
                      fontWeight: 600,
                    }}
                  >
                    {loadingPreview && audience === "matching"
                      ? "Finding matches…"
                      : `${audience === "matching" ? previewCandidates.length : "?"} matching candidates`}
                  </span>
                </div>
              </div>

              {/* Option B: All Candidates */}
              <div
                onClick={() => setAudience("all")}
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: audience === "all" ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: audience === "all" ? "rgba(37,99,235,0.05)" : "#fff",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div className="flex between" style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
                    <Globe size={18} color="#6366f1" />
                    All Candidates in Database
                  </div>
                  <input
                    type="radio"
                    name="audience"
                    checked={audience === "all"}
                    onChange={() => setAudience("all")}
                    style={{ width: 16, height: 16 }}
                  />
                </div>
                <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                  Broadcast this announcement to all active candidates across the entire company talent pool with a valid email.
                </div>
                <div style={{ marginTop: 8 }}>
                  <span
                    className="badge"
                    style={{
                      background: audience === "all" ? "rgba(99,102,241,0.15)" : undefined,
                      color: audience === "all" ? "#6366f1" : undefined,
                      fontWeight: 600,
                    }}
                  >
                    {loadingPreview && audience === "all"
                      ? "Calculating…"
                      : `${totalCandidates} total candidates`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Recipient Candidate Preview & Selection */}
          <div className="card" style={{ padding: 12, marginBottom: 16 }}>
            <div className="flex between" style={{ cursor: "pointer" }} onClick={() => setShowRecipients((v) => !v)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                <Users size={16} />
                <span>
                  Recipients ({selectedCandidateIds.length} of {previewCandidates.length} selected)
                </span>
                <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                  — {audience === "matching" ? "Filtered by Domain Match" : "All Candidates"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--primary)" }}>
                  {showRecipients ? "Hide list" : "View recipients"}
                </span>
                {showRecipients ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>

            {showRecipients && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div className="flex between" style={{ marginBottom: 8, fontSize: 12 }}>
                  <button type="button" className="btn sm ghost" onClick={toggleSelectAll}>
                    {selectedCandidateIds.length === previewCandidates.length ? "Deselect all" : "Select all"}
                  </button>
                  <span className="muted">Check or uncheck individual candidates</span>
                </div>

                <div style={{ display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                  {previewCandidates.map((c) => {
                    const isSelected = selectedCandidateIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex between"
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: isSelected ? "#f8fafc" : "#fff",
                          border: "1px solid var(--border)",
                          fontSize: 12.5,
                          cursor: "pointer",
                        }}
                      >
                        <div className="flex" style={{ gap: 8, overflow: "hidden" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCandidate(c.id)}
                            style={{ width: 15, height: 15 }}
                          />
                          <div className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
                            {initials(c.name)}
                          </div>
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                          <span className="muted">({c.email})</span>
                          {c.current_title && <span className="muted">· {c.current_title}</span>}
                          {c.location && <span>· 📍 {c.location}</span>}
                        </div>
                        <span className="badge" style={{ fontSize: 11, padding: "1px 6px" }}>
                          {c.match_reason}
                        </span>
                      </label>
                    );
                  })}
                  {previewCandidates.length === 0 && (
                    <div className="muted" style={{ padding: 12, textAlign: "center" }}>
                      No candidates match this audience criteria with an email address.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Step 4: Email Subject & Body Customization */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6 }}>
              3. Vacancy Announcement Message
            </label>

            <div className="field" style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12 }}>Subject Line</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line…"
              />
            </div>

            <div className="field">
              <label style={{ fontSize: 12 }}>Email Message Body</label>
              <textarea
                rows={9}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Compose your vacancy message…"
                style={{ fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }}
              />
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
              <span className="muted" style={{ fontSize: 11.5 }}>Available tags:</span>
              {[
                "{{candidate_name}}",
                "{{job_title}}",
                "{{company_name}}",
                "{{location}}",
                "{{salary_range}}",
                "{{department}}",
                "{{requirements}}",
              ].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="pill"
                  style={{ fontSize: 11, padding: "2px 8px", cursor: "pointer", background: "#f1f5f9" }}
                  onClick={() => insertTag(tag)}
                  title={`Click to insert ${tag}`}
                >
                  + {tag}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
