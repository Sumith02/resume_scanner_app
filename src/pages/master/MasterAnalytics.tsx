import { useEffect, useState } from "react";
import { Building2, DollarSign, FileText, Users } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, Stat } from "../../components/ui";
import type { PlatformAnalytics } from "../../types";

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function MasterAnalytics() {
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .platformAnalytics()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load platform analytics"));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <div className="muted">Loading platform analytics…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Platform Analytics</h1>
          <div className="sub">Cross-tenant health, plan mix and usage.</div>
        </div>
      </div>

      <div className="grid cols-4">
        <Stat label="Organizations" value={data.organizations.total} icon={<Building2 size={18} />} />
        <Stat label="MRR" value={money(data.organizations.mrr_cents)} icon={<DollarSign size={18} />} />
        <Stat label="Candidates" value={data.totals.candidates ?? 0} icon={<Users size={18} />} />
        <Stat label="Jobs" value={data.totals.jobs ?? 0} icon={<FileText size={18} />} />
      </div>

      <div className="grid cols-3 mt-2">
        <div className="card">
          <h3>Organizations by status</h3>
          {data.organizations.by_status.length === 0 && <Empty title="No data" />}
          {data.organizations.by_status.map((s) => (
            <div className="flex between" key={s.status} style={{ padding: "6px 0" }}>
              <span>{s.status.replace(/_/g, " ")}</span>
              <strong>{s.count}</strong>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Organizations by plan</h3>
          {data.organizations.by_plan.length === 0 && <Empty title="No data" />}
          {data.organizations.by_plan.map((s) => (
            <div className="flex between" key={s.plan} style={{ padding: "6px 0" }}>
              <span>{s.plan.replace(/_/g, " ")}</span>
              <strong>{s.count}</strong>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Platform totals</h3>
          {Object.entries(data.totals).map(([k, v]) => (
            <div className="flex between" key={k} style={{ padding: "6px 0" }}>
              <span>{k.replace(/_/g, " ")}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-2 table-wrap">
        <h3>Top organizations</h3>
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Seats</th>
              <th>Candidates</th>
              <th>Jobs</th>
            </tr>
          </thead>
          <tbody>
            {data.top_orgs.map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>{o.name}</strong>
                </td>
                <td>{o.status}</td>
                <td>{o.plan}</td>
                <td>{o.seat_limit}</td>
                <td>{o.candidates}</td>
                <td>{o.jobs}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.top_orgs.length === 0 && <Empty title="No organizations" />}
      </div>
    </>
  );
}
