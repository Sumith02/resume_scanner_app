import { useEffect, useState } from "react";
import { Search, Sparkles, Wand2 } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, Spinner } from "../../components/ui";
import type { CopilotResult, Job, MatchResponse } from "../../types";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";

function ScoreBar({ score, band }: { score: number; band: string }) {
  const color = band === "strong" ? "#22c55e" : band === "possible" ? "#f59e0b" : "#94a3b8";
  return (
    <div className="flex" style={{ gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 4 }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <strong style={{ color, fontSize: 12.5 }}>{score}</strong>
    </div>
  );
}

export function MatchesPage() {
  const { user } = useAuth();
  const canMatch = can(user, "rediscovery:run");
  const canCopilot = can(user, "copilot:use");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(40);
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [copilot, setCopilot] = useState<CopilotResult | null>(null);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);

  useEffect(() => {
    api.listJobs().then((j) => {
      setJobs(j);
      if (j.length) setJobId(j[0].id);
    });
  }, []);

  async function runMatch() {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.matchJob({ job_id: jobId, threshold }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Match failed");
    } finally {
      setBusy(false);
    }
  }

  async function runCopilot() {
    if (!query.trim()) return;
    setCopilotBusy(true);
    setCopilotError(null);
    try {
      setCopilot(await api.copilot(query));
    } catch (e) {
      setCopilotError(e instanceof Error ? e.message : "Copilot failed");
    } finally {
      setCopilotBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>AI Matching</h1>
          <div className="sub">Rank your talent database against a role, or ask the Copilot.</div>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <div className="card" style={{ gridColumn: "span 2" }}>
          <h3>
            <Sparkles size={15} /> Match candidates to a job
          </h3>
          <div className="row mt-2">
            <div className="field">
              <label>Job</label>
              <select
                value={jobId ?? ""}
                onChange={(e) => setJobId(Number(e.target.value))}
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Minimum score: {threshold}</label>
              <input
                type="range"
                min={0}
                max={90}
                step={5}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </div>
          </div>
          <button
            className="btn primary"
            disabled={!jobId || busy || !canMatch}
            onClick={runMatch}
          >
            {busy ? <Spinner /> : <Search size={15} />} Run match
          </button>
          {!canMatch && <span className="muted"> Ask an admin for rediscovery access.</span>}
        </div>

        <div className="card" style={{ gridColumn: "span 2" }}>
          <h3>
            <Wand2 size={15} /> Copilot
          </h3>
          <div className="field mt-2">
            <label>Ask in plain language</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runCopilot()}
              placeholder="python engineers with 5 years in Berlin"
              disabled={!canCopilot}
            />
          </div>
          <button
            className="btn primary"
            disabled={copilotBusy || !canCopilot || !query.trim()}
            onClick={runCopilot}
          >
            {copilotBusy ? <Spinner /> : <Wand2 size={15} />} Ask Copilot
          </button>
          {!canCopilot && (
            <span className="muted" style={{ marginLeft: 8 }}>
              Copilot is available on the Growth plan and above.
            </span>
          )}
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {copilotError && <Alert kind="error">{copilotError}</Alert>}

      {result && (
        <div className="card">
          <div className="flex between">
            <h3>
              {result.job_title} · {result.count} matches
            </h3>
          </div>
          {result.results.length === 0 && <Empty title="No candidates above threshold" />}
          <div className="grid cols-2 mt-2">
            {result.results.map((c) => (
              <div className="card" key={c.id} style={{ boxShadow: "none" }}>
                <div className="flex between">
                  <strong>{c.name}</strong>
                  <span className="pill">{c.experience_years}y</span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                  {[c.current_title, c.location].filter(Boolean).join(" · ") || "—"}
                </div>
                <ScoreBar score={c.match_score} band={c.match_band} />
                <div className="flex wrap mt-2" style={{ gap: 4 }}>
                  {c.matched_skills.map((s) => (
                    <span className="pill" key={s} style={{ color: "#15803d" }}>
                      {s}
                    </span>
                  ))}
                  {c.missing_skills.map((s) => (
                    <span className="pill" key={s} style={{ color: "#b91c1c" }}>
                      {s}
                    </span>
                  ))}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {c.match_reasons.join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {copilot && (
        <div className="card mt-2">
          <Alert kind="info">{copilot.message}</Alert>
          <div className="flex wrap" style={{ gap: 6, marginBottom: 10 }}>
            {copilot.criteria.skills.map((s) => (
              <span className="pill" key={s}>
                skill: {s}
              </span>
            ))}
            {copilot.criteria.min_experience && (
              <span className="pill">{copilot.criteria.min_experience}+ years</span>
            )}
            {copilot.criteria.location && <span className="pill">in {copilot.criteria.location}</span>}
            {copilot.criteria.stages.map((s) => (
              <span className="pill" key={s}>
                stage: {s}
              </span>
            ))}
          </div>
          {copilot.candidates.length === 0 && <Empty title="No candidates matched that question" />}
          <div className="table-wrap">
            {copilot.candidates.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Location</th>
                    <th>Experience</th>
                    <th>Skills</th>
                  </tr>
                </thead>
                <tbody>
                  {copilot.candidates.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.current_title || "—"}</td>
                      <td>{c.location || "—"}</td>
                      <td>{c.experience_years}y</td>
                      <td>{c.skills.slice(0, 5).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
