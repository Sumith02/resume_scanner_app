import { useEffect, useState } from "react";
import { Briefcase, Building2, FileText, Users } from "lucide-react";
import { api } from "../../api";
import { Stat } from "../../components/ui";
import type { AuditEntry } from "../../types";
import { formatDate } from "../../lib/format";

type Stats = {
  organizations: number;
  total_seats: number;
  total_users: number;
  total_jobs: number;
  total_candidates: number;
  status_breakdown: Record<string, number>;
};

export function MasterOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.masterStats(), api.masterAudit()])
      .then(([s, a]) => {
        setStats(s);
        setAudit(a.slice(0, 12));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!stats) return <div className="muted">Loading platform metrics…</div>;

  return (
    <>
      <div className="grid cols-4">
        <Stat label="Companies" value={stats.organizations} icon={<Building2 size={18} />} />
        <Stat label="Allocated Seats" value={stats.total_seats} icon={<Users size={18} />} />
        <Stat label="Users" value={stats.total_users} icon={<Users size={18} />} />
        <Stat label="Jobs" value={stats.total_jobs} icon={<Briefcase size={18} />} />
      </div>

      <div className="grid cols-4 mt-2">
        <Stat label="Candidates" value={stats.total_candidates} icon={<FileText size={18} />} />
        {Object.entries(stats.status_breakdown).map(([status, count]) => (
          <Stat key={status} label={status.replace(/_/g, " ")} value={count} />
        ))}
      </div>

      <div className="card mt-2">
        <h3>Recent platform activity</h3>
        <p className="muted mt-0">Administrative and provisioning actions across all tenants.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="muted">{formatDate(a.created_at)}</td>
                  <td>{a.actor_email ?? "—"}</td>
                  <td>
                    <code>{a.action}</code>
                  </td>
                  <td className="muted" style={{ maxWidth: 380 }}>
                    {JSON.stringify(a.details)}
                  </td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}