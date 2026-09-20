import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Briefcase, Users } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, StageBadge } from "../../components/ui";
import type { PortalView } from "../../types";

interface PortalCandidate {
  name: string;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  skills: string[];
  experience_years: number;
  stage: string;
}

export function ClientPortalPage() {
  const { token = "" } = useParams();
  const [view, setView] = useState<PortalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<PortalCandidate[]>([]);
  const [loadingCands, setLoadingCands] = useState(false);

  useEffect(() => {
    api
      .publicPortal(token)
      .then((v) => {
        setView(v);
        if (v.can_view_candidates && v.jobs.length) setJobId(v.jobs[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "This link is invalid or expired"));
  }, [token]);

  useEffect(() => {
    if (!jobId || !view?.can_view_candidates) return;
    setLoadingCands(true);
    api
      .publicPortalCandidates(token, jobId)
      .then((r) => setCandidates(r.candidates))
      .catch(() => setCandidates([]))
      .finally(() => setLoadingCands(false));
  }, [token, jobId, view?.can_view_candidates]);

  if (error)
    return (
      <div className="center-screen">
        <div className="auth-card">
          <Alert kind="error">{error}</Alert>
        </div>
      </div>
    );

  if (!view) return <div className="center-screen">Loading client portal…</div>;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 20px" }}>
      <div className="auth-brand" style={{ marginBottom: 22 }}>
        <div className="logo">N</div>
        <div>
          <div style={{ fontWeight: 700 }}>Nexerra Talent OS</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Client Portal
          </div>
        </div>
      </div>

      <div className="page-head">
        <div>
          <h1>{view.client_name}</h1>
          <div className="sub">{view.organization ? `Shared by ${view.organization}` : "Shared shortlist"}</div>
        </div>
      </div>

      <h3>
        <Briefcase size={15} /> Open roles
      </h3>
      <div className="grid cols-2">
        {view.jobs.map((j) => (
          <div
            className="card"
            key={j.id}
            style={jobId === j.id ? { borderColor: "#0ea5e9", cursor: "pointer" } : { cursor: "pointer" }}
            onClick={() => view.can_view_candidates && setJobId(j.id)}
          >
            <div className="flex between">
              <strong>{j.title}</strong>
              <span className="pill">{j.status.replace(/_/g, " ")}</span>
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              {[j.location, j.employment_type].filter(Boolean).join(" · ") || "—"}
            </div>
            {j.candidates && (
              <div className="flex wrap mt-2" style={{ gap: 6 }}>
                <span className="pill">{j.candidates.total} candidates</span>
                {Object.entries(j.candidates.by_stage).map(([stage, count]) => (
                  <span className="pill" key={stage}>
                    {stage.replace(/_/g, " ")}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {view.jobs.length === 0 && <Empty title="No roles shared yet" />}

      {view.can_view_candidates && jobId && (
        <>
          <h3 className="mt-2">
            <Users size={15} /> Shortlist
          </h3>
          <div className="card table-wrap">
            {loadingCands ? (
              <div className="muted">Loading…</div>
            ) : candidates.length === 0 ? (
              <Empty title="No candidates to show" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Company</th>
                    <th>Location</th>
                    <th>Experience</th>
                    <th>Skills</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td>{c.current_title || "—"}</td>
                      <td>{c.current_company || "—"}</td>
                      <td>{c.location || "—"}</td>
                      <td>{c.experience_years}y</td>
                      <td>{c.skills.slice(0, 5).join(", ")}</td>
                      <td>
                        <StageBadge stage={c.stage} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
