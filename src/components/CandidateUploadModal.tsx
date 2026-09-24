import { useState } from "react";
import { AlertCircle, FileText, Layers, Trash2, Upload, User } from "lucide-react";
import { api } from "../api";
import { Alert, Modal } from "./ui";
import { PIPELINE_STAGES, stageLabel } from "../lib/format";
import type { Candidate, Job } from "../types";

interface BulkResult {
  total: number;
  succeeded: number;
  duplicates: number;
  failed: number;
  candidates: Candidate[];
  errors: { filename: string; error: string }[];
}

export function CandidateUploadModal({
  onClose,
  onCreated,
  jobs = [],
}: {
  onClose: () => void;
  onCreated: () => void;
  jobs?: Job[];
}) {
  const [tab, setTab] = useState<"bulk" | "single">("bulk");

  // Bulk state
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [targetJobId, setTargetJobId] = useState<string>("");
  const [targetStage, setTargetStage] = useState<string>("NEW");
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  // Single state
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [manual, setManual] = useState({ name: "", email: "", phone: "", location: "", current_title: "" });
  const [singleResult, setSingleResult] = useState<Candidate | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);
    setBulkFiles((prev) => [...prev, ...newFiles]);
  }

  function removeBulkFile(index: number) {
    setBulkFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function submitBulk() {
    if (bulkFiles.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      bulkFiles.forEach((f) => form.append("resumes", f));
      if (targetJobId) form.append("job_id", targetJobId);
      if (targetStage) form.append("stage", targetStage);

      const res = await api.bulkUploadCandidates(form);
      setBulkResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitSingle() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (singleFile) form.append("resume", singleFile);
      if (manual.name) form.append("name", manual.name);
      if (manual.email) form.append("email", manual.email);
      if (manual.phone) form.append("phone", manual.phone);
      if (manual.location) form.append("location", manual.location);
      if (manual.current_title) form.append("current_title", manual.current_title);
      if (targetJobId) form.append("job_ids", targetJobId);
      if (targetStage) form.append("stage", targetStage);

      const cand = await api.createCandidateForm(form);
      setSingleResult(cand);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const hasCompleted = bulkResult !== null || singleResult !== null;

  return (
    <Modal
      wide={hasCompleted || tab === "bulk"}
      title={hasCompleted ? "Upload Results" : "Add Candidates"}
      onClose={onClose}
      footer={
        hasCompleted ? (
          <button className="btn primary" onClick={onCreated}>
            Done & View Candidates
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            {tab === "bulk" ? (
              <button
                className="btn primary"
                disabled={busy || bulkFiles.length === 0}
                onClick={submitBulk}
              >
                {busy ? "Parsing & Uploading…" : `Upload ${bulkFiles.length} Resume${bulkFiles.length === 1 ? "" : "s"}`}
              </button>
            ) : (
              <button
                className="btn primary"
                disabled={busy || (!singleFile && !manual.name)}
                onClick={submitSingle}
              >
                {busy ? "Processing…" : "Add candidate"}
              </button>
            )}
          </>
        )
      }
    >
      {error && <Alert kind="error">{error}</Alert>}

      {/* Tabs if not completed */}
      {!hasCompleted && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
          <button
            type="button"
            className={`btn sm ${tab === "bulk" ? "primary" : "ghost"}`}
            onClick={() => setTab("bulk")}
          >
            <Layers size={14} /> Bulk Resume Upload
          </button>
          <button
            type="button"
            className={`btn sm ${tab === "single" ? "primary" : "ghost"}`}
            onClick={() => setTab("single")}
          >
            <User size={14} /> Single / Manual Entry
          </button>
        </div>
      )}

      {/* Bulk Results View */}
      {bulkResult && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div className="card" style={{ padding: 12, textAlign: "center", background: "#f0fdf4", borderColor: "#bbf7d0" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{bulkResult.succeeded}</div>
              <div style={{ fontSize: 12, color: "#166534" }}>Uploaded & Parsed</div>
            </div>
            {bulkResult.duplicates > 0 && (
              <div className="card" style={{ padding: 12, textAlign: "center", background: "#fffbeb", borderColor: "#fde68a" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#d97706" }}>{bulkResult.duplicates}</div>
                <div style={{ fontSize: 12, color: "#92400e" }}>Possible Duplicates</div>
              </div>
            )}
            {bulkResult.failed > 0 && (
              <div className="card" style={{ padding: 12, textAlign: "center", background: "#fef2f2", borderColor: "#fecaca" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#dc2626" }}>{bulkResult.failed}</div>
                <div style={{ fontSize: 12, color: "#991b1b" }}>Failed Documents</div>
              </div>
            )}
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Imported Profiles:</div>
          <div style={{ display: "grid", gap: 8, maxHeight: 300, overflowY: "auto", marginBottom: 12 }}>
            {bulkResult.candidates.map((cand) => (
              <div
                key={cand.id}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "#fff",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    {cand.name}
                    {cand.duplicate_of_id && (
                      <span className="badge" style={{ marginLeft: 8, color: "#b45309", background: "#fef3c7" }}>
                        Duplicate
                      </span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {cand.current_title || "Candidate"}
                    {cand.location ? ` · 📍 ${cand.location}` : ""}
                    {cand.experience_years ? ` · ${cand.experience_years} yrs exp` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 280 }}>
                  {cand.skills.slice(0, 4).map((s) => (
                    <span key={s} className="pill" style={{ fontSize: 11, padding: "1px 6px" }}>
                      {s}
                    </span>
                  ))}
                  {cand.skills.length > 4 && (
                    <span className="muted" style={{ fontSize: 11 }}>+{cand.skills.length - 4} more</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {bulkResult.errors.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#dc2626", marginBottom: 6 }}>
                Files with errors ({bulkResult.errors.length}):
              </div>
              <div style={{ display: "grid", gap: 4, maxHeight: 120, overflowY: "auto", fontSize: 12 }}>
                {bulkResult.errors.map((err, idx) => (
                  <div key={idx} className="flex" style={{ gap: 6, color: "#991b1b" }}>
                    <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                    <strong>{err.filename}:</strong> {err.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Single Result View */}
      {singleResult && (
        <Alert kind={singleResult.duplicate_of_id ? "info" : "success"}>
          <div style={{ fontWeight: 600 }}>{singleResult.name} successfully added!</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {singleResult.current_title || "Candidate"}
            {singleResult.location ? ` · 📍 ${singleResult.location}` : ""}
          </div>
          {singleResult.skills.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Skills: {singleResult.skills.slice(0, 10).join(", ")}
              {singleResult.skills.length > 10 ? "…" : ""}
            </div>
          )}
          {singleResult.duplicate_of_id && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#92400e" }}>
              ⚠️ Possible duplicate detected in this company's talent database.
            </div>
          )}
        </Alert>
      )}

      {/* Bulk Form */}
      {!hasCompleted && tab === "bulk" && (
        <>
          <div
            style={{
              border: "2px dashed var(--border)",
              borderRadius: 12,
              padding: "24px 16px",
              textAlign: "center",
              background: "#fafbfe",
              cursor: "pointer",
              marginBottom: 14,
            }}
            onClick={() => document.getElementById("bulk-file-input")?.click()}
          >
            <input
              id="bulk-file-input"
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            <Upload size={32} color="var(--primary)" style={{ margin: "0 auto 8px auto" }} />
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Click or Drag & Drop Multiple Resumes Here</div>
            <div className="muted mt-1" style={{ fontSize: 12.5 }}>
              Select multiple PDF, DOCX, or TXT files. Names, skills, locations, and summaries will be automatically extracted.
            </div>
          </div>

          {bulkFiles.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="flex between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Selected Files ({bulkFiles.length}):
                </span>
                <button
                  type="button"
                  className="btn sm ghost"
                  style={{ fontSize: 11, padding: "2px 6px" }}
                  onClick={() => setBulkFiles([])}
                >
                  Clear all
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  maxHeight: 180,
                  overflowY: "auto",
                  padding: 8,
                  background: "var(--surface-2)",
                  borderRadius: 8,
                }}
              >
                {bulkFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex between"
                    style={{
                      padding: "4px 8px",
                      background: "#fff",
                      borderRadius: 6,
                      fontSize: 12.5,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex" style={{ gap: 6, overflow: "hidden", textOverflow: "ellipsis" }}>
                      <FileText size={14} className="muted" />
                      <span style={{ maxWidth: 300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {file.name}
                      </span>
                      <span className="muted">({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button
                      type="button"
                      className="btn sm ghost"
                      style={{ padding: 2, height: "auto" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBulkFile(idx);
                      }}
                    >
                      <Trash2 size={13} color="#ef4444" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="row">
            <div className="field">
              <label>Target Vacancy / Job (Optional)</label>
              <select value={targetJobId} onChange={(e) => setTargetJobId(e.target.value)}>
                <option value="">Auto-match by skills (Recommended)</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} {j.department ? `(${j.department})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Initial Pipeline Stage</label>
              <select value={targetStage} onChange={(e) => setTargetStage(e.target.value)}>
                {PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {stageLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {/* Single / Manual Form */}
      {!hasCompleted && tab === "single" && (
        <>
          <div className="field">
            <label>Resume file (PDF / DOCX / TXT)</label>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => setSingleFile(e.target.files?.[0] ?? null)}
            />
            <div className="muted mt-2" style={{ fontSize: 12.5 }}>
              <Upload size={13} /> Automatically parses candidate name, email, phone, location, skills, and summary.
            </div>
          </div>

          <div className="muted" style={{ textAlign: "center", margin: "8px 0" }}>
            — candidate details (auto-extracted from resume if provided) —
          </div>

          <div className="row">
            <div className="field">
              <label>Name</label>
              <input
                value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })}
                placeholder="Required if no file uploaded"
              />
            </div>
            <div className="field">
              <label>Professional Title</label>
              <input
                value={manual.current_title}
                onChange={(e) => setManual({ ...manual, current_title: e.target.value })}
                placeholder="e.g. Frontend Developer"
              />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>Email</label>
              <input
                value={manual.email}
                onChange={(e) => setManual({ ...manual, email: e.target.value })}
                placeholder="candidate@example.com"
              />
            </div>
            <div className="field">
              <label>Phone</label>
              <input
                value={manual.phone}
                onChange={(e) => setManual({ ...manual, phone: e.target.value })}
                placeholder="+1 234 567 890"
              />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>Location</label>
              <input
                value={manual.location}
                onChange={(e) => setManual({ ...manual, location: e.target.value })}
                placeholder="e.g. Bengaluru, India or Remote"
              />
            </div>
            <div className="field">
              <label>Assign to Job</label>
              <select value={targetJobId} onChange={(e) => setTargetJobId(e.target.value)}>
                <option value="">Auto-match by skills</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}