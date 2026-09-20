import { useState } from "react";
import { Upload } from "lucide-react";
import { api } from "../api";
import { Alert, Modal } from "./ui";

export function CandidateUploadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [manual, setManual] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; skills: string[]; dup: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (file) form.append("resume", file);
      if (manual.name) form.append("name", manual.name);
      if (manual.email) form.append("email", manual.email);
      if (manual.phone) form.append("phone", manual.phone);
      const cand = await api.createCandidateForm(form);
      setResult({
        name: cand.name,
        skills: cand.skills,
        dup: cand.duplicate_of_id != null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add candidate"
      onClose={onClose}
      footer={
        result ? (
          <button className="btn primary" onClick={onCreated}>
            Done
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || (!file && !manual.name)} onClick={submit}>
              {busy ? "Processing…" : "Add candidate"}
            </button>
          </>
        )
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      {result ? (
        <Alert kind={result.dup ? "info" : "success"}>
          <strong>{result.name}</strong> added.
          {result.skills.length > 0 && (
            <>
              <br />
              Extracted skills: {result.skills.slice(0, 12).join(", ")}
              {result.skills.length > 12 ? "…" : ""}
            </>
          )}
          {result.dup && (
            <>
              <br />
              Possible duplicate detected in this company's talent database.
            </>
          )}
        </Alert>
      ) : (
        <>
          <div className="field">
            <label>Resume file (PDF / DOCX / TXT)</label>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="muted mt-2" style={{ fontSize: 12.5 }}>
              <Upload size={13} /> Resumes are parsed for name, contact, skills and experience.
            </div>
          </div>
          <div className="muted" style={{ textAlign: "center", margin: "6px 0" }}>
            — or add manually —
          </div>
          <div className="field">
            <label>Name</label>
            <input
              value={manual.name}
              onChange={(e) => setManual({ ...manual, name: e.target.value })}
              placeholder="Required if no file"
            />
          </div>
          <div className="row">
            <div className="field">
              <label>Email</label>
              <input
                value={manual.email}
                onChange={(e) => setManual({ ...manual, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Phone</label>
              <input
                value={manual.phone}
                onChange={(e) => setManual({ ...manual, phone: e.target.value })}
              />
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}