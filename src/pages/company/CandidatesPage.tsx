import { useCallback, useEffect, useState } from "react";
import { Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, StageBadge } from "../../components/ui";
import { CandidateUploadModal } from "../../components/CandidateUploadModal";
import { CandidateDrawer } from "../../components/CandidateDrawer";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import { PIPELINE_STAGES, formatDate, initials, stageLabel } from "../../lib/format";
import type { Candidate, Job, Tag } from "../../types";

export function CandidatesPage() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  const [tagId, setTagId] = useState("");
  const [jobId, setJobId] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);

  const canDelete = can(user, "candidate:delete") || user?.role === "MASTER_ADMIN" || user?.role === "COMPANY_OWNER" || user?.role === "COMPANY_ADMIN";

  const load = useCallback(async () => {
    try {
      const [c, j, t] = await Promise.all([
        api.listCandidates({ q: query || undefined, stage: stage || undefined, tag_id: tagId || undefined, job_id: jobId || undefined }),
        api.listJobs(),
        api.listTags(),
      ]);
      setCandidates(c);
      setJobs(j);
      setTags(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candidates");
    }
  }, [query, stage, tagId, jobId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function createTag() {
    if (!newTag.trim()) return;
    await api.createTag(newTag.trim(), "#2563eb");
    setNewTag("");
    setShowTagInput(false);
    await load();
  }

  async function handleDelete(c: Candidate, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete candidate "${c.name}"? This action cannot be undone.`)) return;
    try {
      setError(null);
      await api.deleteCandidate(c.id);
      setNotice(`Deleted candidate "${c.name}".`);
      setSelectedIds((prev) => prev.filter((id) => id !== c.id));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete candidate");
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} candidate(s)? This action cannot be undone.`)) return;
    setDeleting(true);
    try {
      setError(null);
      await api.bulkDeleteCandidates(selectedIds);
      setNotice(`Successfully deleted ${selectedIds.length} candidate(s).`);
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete candidates");
    } finally {
      setDeleting(false);
    }
  }

  function toggleSelect(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === candidates.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(candidates.map((c) => c.id));
    }
  }

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="page-head">
        <div>
          <h1>Talent Database</h1>
          <div className="sub">
            Searchable, reusable candidate intelligence for this company.
          </div>
        </div>
        <div className="flex">
          <button className="btn ghost" onClick={() => setShowTagInput((v) => !v)}>
            <SlidersHorizontal size={15} /> Tag
          </button>
          {can(user, "candidate:create") && (
            <button className="btn primary" onClick={() => setShowUpload(true)}>
              <Plus size={16} /> Add candidate
            </button>
          )}
        </div>
      </div>

      {showTagInput && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="flex">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="New tag name…"
              onKeyDown={(e) => e.key === "Enter" && createTag()}
            />
            <button className="btn primary" onClick={createTag}>
              Create tag
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="flex wrap">
          <div className="flex" style={{ flex: 2, minWidth: 220 }}>
            <Search size={16} className="muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, skill, company, resume text…"
            />
          </div>
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ maxWidth: 170 }}>
            <option value="">All stages</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {stageLabel(s)}
              </option>
            ))}
          </select>
          <select value={tagId} onChange={(e) => setTagId(e.target.value)} style={{ maxWidth: 170 }}>
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            padding: "10px 16px",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#b91c1c" }}>
            <span>{selectedIds.length} candidate(s) selected</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn sm ghost"
              onClick={() => setSelectedIds([])}
            >
              Cancel
            </button>
            <button
              className="btn sm danger"
              disabled={deleting}
              onClick={handleBulkDelete}
            >
              <Trash2 size={14} /> {deleting ? "Deleting…" : `Delete selected (${selectedIds.length})`}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {canDelete && (
                  <th style={{ width: 36, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={candidates.length > 0 && selectedIds.length === candidates.length}
                      onChange={toggleSelectAll}
                      title="Select all"
                    />
                  </th>
                )}
                <th>Candidate</th>
                <th>Title</th>
                <th>Skills</th>
                <th>Exp</th>
                <th>Stage</th>
                <th>Added</th>
                {canDelete && <th style={{ width: 60, textAlign: "center" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setSelected(c.id)}>
                  {canDelete && (
                    <td style={{ textAlign: "center" }} onClick={(e) => toggleSelect(c.id, e)}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() => {}}
                      />
                    </td>
                  )}
                  <td>
                    <div className="flex">
                      <div className="avatar">{initials(c.name)}</div>
                      <div>
                        <div style={{ fontWeight: 650 }}>
                          {c.name}
                          {c.duplicate_of_id && (
                            <span className="pill" style={{ marginLeft: 8, color: "#b45309" }}>
                              dup
                            </span>
                          )}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {c.email ?? c.phone ?? "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {c.current_title ?? "—"}
                    {c.current_company ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.current_company}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    {c.skills.slice(0, 4).map((s) => (
                      <span key={s} className="pill">
                        {s}
                      </span>
                    ))}
                    {c.skills.length > 4 && <span className="muted">+{c.skills.length - 4}</span>}
                  </td>
                  <td>{c.experience_years}y</td>
                  <td>
                    <StageBadge stage={c.stage} />
                  </td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {formatDate(c.created_at)}
                  </td>
                  {canDelete && (
                    <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn sm ghost"
                        style={{ padding: "4px 8px", color: "#dc2626" }}
                        onClick={(e) => handleDelete(c, e)}
                        title="Delete candidate"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {candidates.length === 0 && (
                <tr>
                  <td colSpan={canDelete ? 8 : 6}>
                    <Empty
                      title="No candidates found"
                      hint="Upload a resume or adjust your search filters."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showUpload && (
        <CandidateUploadModal
          onClose={() => setShowUpload(false)}
          onCreated={() => {
            setShowUpload(false);
            void load();
          }}
        />
      )}

      {selected !== null && (
        <CandidateDrawer
          candidateId={selected}
          jobs={jobs}
          allTags={tags}
          canEdit={can(user, "candidate:edit")}
          canDelete={canDelete}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
        />
      )}
    </>
  );
}