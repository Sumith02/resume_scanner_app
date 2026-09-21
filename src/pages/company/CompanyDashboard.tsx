import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, FileText, Mail, Users, UserCheck } from "lucide-react";
import { api } from "../../api";
import { Alert, Stat } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import type { GmailStatus, Pipeline, Seats } from "../../types";
import { PIPELINE_STAGES, stageColor } from "../../lib/format";

export function CompanyDashboard() {
  const { user } = useAuth();
  const [seats, setSeats] = useState<Seats | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [counts, setCounts] = useState({ jobs: 0, activeJobs: 0, candidates: 0 });
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, p, jobs, c] = await Promise.all([
        api.seats(),
        api.pipeline(),
        api.listJobs(),
        api.listCandidates(),
      ]);
      setSeats(s);
      setPipeline(p);
      setCounts({
        jobs: jobs.length,
        activeJobs: jobs.filter((j) => j.status === "OPEN").length,
        candidates: c.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    }
    if (can(user, "email:read")) {
      try {
        setGmail(await api.gmailStatus());
      } catch {
        setGmail(null);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestSeats() {
    try {
      await api.requestSeats("Additional recruiters needed");
      setRequested(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }

  const total = pipeline
    ? Object.values(pipeline.counts).reduce((a, b) => a + (b ?? 0), 0)
    : 0;

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}

      {can(user, "gmail:connect") && gmail && !gmail.account && (
        <div className="card mt-2 flex between" style={{ alignItems: "center" }}>
          <div className="flex" style={{ gap: 10 }}>
            <Mail size={18} />
            <div>
              <strong>Connect your email to receive resumes</strong>
              <div className="muted" style={{ fontSize: 12.5 }}>
                Resumes are ingested from the mailbox registered for your account. Connect it to
                start building your talent database.
              </div>
            </div>
          </div>
          <Link className="btn primary" to="/app/email">
            Connect email
          </Link>
        </div>
      )}

      <div className="grid cols-4">
        <Stat label="Open Jobs" value={loading ? "—" : counts.activeJobs} icon={<Briefcase size={18} />} />
        <Stat label="Candidates" value={loading ? "—" : counts.candidates} icon={<FileText size={18} />} />
        <Stat
          label="Seats Used"
          value={loading ? "—" : seats ? `${seats.used}/${seats.limit}` : "—"}
          icon={<Users size={18} />}
        />
        <Stat label="In Pipeline" value={loading ? "—" : total} icon={<UserCheck size={18} />} />
      </div>

      <div className="card mt-2">
        <div className="flex between">
          <div>
            <h3>Seat allocation</h3>
            <p className="muted mt-0">
              {seats
                ? `${seats.available} seat(s) available under your current plan.`
                : "Loading…"}
            </p>
          </div>
          <button
            className="btn ghost"
            disabled={!seats || seats.available > 0 || requested}
            onClick={requestSeats}
            title={seats && seats.available > 0 ? "Seats still available" : "Request more seats"}
          >
            {requested ? "Request pending" : "Request additional seats"}
          </button>
        </div>
        {seats && (
          <div
            style={{
              height: 10,
              background: "var(--surface-2)",
              borderRadius: 999,
              overflow: "hidden",
              marginTop: 12,
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (seats.used / Math.max(1, seats.limit)) * 100)}%`,
                height: "100%",
                background: seats.available === 0 ? "var(--danger)" : "var(--brand)",
              }}
            />
          </div>
        )}
      </div>

      <div className="card mt-2">
        <h3>Recruitment funnel</h3>
        <p className="muted mt-0">Live candidate distribution across pipeline stages.</p>
        <div className="grid cols-4">
          {PIPELINE_STAGES.map((stage) => {
            const n = loading ? "—" : pipeline?.counts[stage] ?? 0;
            return (
              <div key={stage} className="flex between" style={{ padding: "8px 0" }}>
                <span className="flex" style={{ gap: 8 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: stageColor(stage),
                      display: "inline-block",
                    }}
                  />
                  {stage.replace(/_/g, " ")}
                </span>
                <strong>{n}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
