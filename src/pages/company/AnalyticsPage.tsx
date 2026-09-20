import { useEffect, useState } from "react";
import { BarChart3, Briefcase, CheckCircle2, FileText, Users } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, Stat } from "../../components/ui";
import { stageColor, stageLabel } from "../../lib/format";
import type { AnalyticsOverview } from "../../types";

function Bars({
  data,
  labelKey,
  valueKey,
  color = "#0ea5e9",
}: {
  data: Record<string, string | number>[];
  labelKey: string;
  valueKey: string;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey])));
  if (data.length === 0) return <Empty title="No data" />;
  return (
    <div>
      {data.map((d, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div className="flex between" style={{ fontSize: 12.5 }}>
            <span>{String(d[labelKey]).replace(/_/g, " ")}</span>
            <strong>{d[valueKey]}</strong>
          </div>
          <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4 }}>
            <div
              style={{
                width: `${(Number(d[valueKey]) / max) * 100}%`,
                height: "100%",
                background: color,
                borderRadius: 4,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .analyticsOverview()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load analytics"));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <div className="muted">Loading analytics…</div>;

  const t = data.totals;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <div className="sub">Hiring funnel, sources and recruiter performance.</div>
        </div>
      </div>

      <div className="grid cols-4">
        <Stat label="Candidates" value={t.candidates} icon={<Users size={18} />} />
        <Stat label="Jobs" value={t.jobs} icon={<Briefcase size={18} />} />
        <Stat label="Interviews" value={t.interviews} icon={<BarChart3 size={18} />} />
        <Stat label="Hires" value={t.hires} icon={<CheckCircle2 size={18} />} />
      </div>

      <div className="grid cols-2 mt-2">
        <div className="card">
          <h3>Pipeline funnel</h3>
          <div>
            {data.funnel.map((f) => (
              <div key={f.stage} style={{ marginBottom: 8 }}>
                <div className="flex between" style={{ fontSize: 12.5 }}>
                  <span>{stageLabel(f.stage)}</span>
                  <strong>{f.count}</strong>
                </div>
                <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4 }}>
                  <div
                    style={{
                      width: `${
                        (f.count / Math.max(1, ...data.funnel.map((x) => x.count))) * 100
                      }%`,
                      height: "100%",
                      background: stageColor(f.stage),
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Conversion:{" "}
            {Object.entries(data.conversion)
              .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}%`)
              .join(" · ")}
          </div>
        </div>

        <div className="card">
          <h3>Candidates by source</h3>
          <Bars data={data.sources} labelKey="source" valueKey="count" color="#8b5cf6" />
        </div>

        <div className="card">
          <h3>Top skills</h3>
          <Bars data={data.top_skills} labelKey="skill" valueKey="count" color="#14b8a6" />
        </div>

        <div className="card">
          <h3>Offers</h3>
          <Bars data={data.offers.by_status} labelKey="status" valueKey="count" color="#ec4899" />
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Acceptance rate: <strong>{data.offers.acceptance_rate}%</strong>
          </div>
        </div>

        <div className="card">
          <h3>Interview load</h3>
          <Bars
            data={data.interview_load.map((x) => ({ name: x.name, count: x.count }))}
            labelKey="name"
            valueKey="count"
            color="#f59e0b"
          />
        </div>

        <div className="card">
          <h3>Recruiter performance</h3>
          <Bars
            data={data.recruiter_performance.map((x) => ({ name: x.name, count: x.candidates }))}
            labelKey="name"
            valueKey="count"
            color="#6366f1"
          />
        </div>
      </div>

      <div className="card mt-2 table-wrap">
        <h3>
          <FileText size={15} /> Job performance
        </h3>
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Status</th>
              <th>Candidates</th>
              <th>Offers</th>
              <th>Hires</th>
            </tr>
          </thead>
          <tbody>
            {data.job_performance.map((j) => (
              <tr key={j.job_id}>
                <td>{j.title}</td>
                <td>{j.status}</td>
                <td>{j.candidates}</td>
                <td>{j.offers}</td>
                <td>{j.hires}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.job_performance.length === 0 && <Empty title="No jobs yet" />}
      </div>
    </>
  );
}
