import { useEffect, useState } from "react";
import { api } from "../api";
import { Alert } from "../components/ui";
import { formatDate } from "../lib/format";
import type { AuditEntry } from "../types";

export function AuditLog({ scope }: { scope: "master" | "org" }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    (scope === "master" ? api.masterAudit() : api.orgAudit())
      .then(setEntries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load audit log"));
  }, [scope]);

  const actions = Array.from(new Set(entries.map((e) => e.action))).sort();
  const visible = filter ? entries.filter((e) => e.action === filter) : entries;

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}

      <div className="page-head">
        <div>
          <h1>Audit Log</h1>
          <div className="sub">
            {scope === "master"
              ? "Administrative and provisioning actions across the platform."
              : "Important administrative and recruitment actions in this company."}
          </div>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {formatDate(e.created_at)}
                  </td>
                  <td>{e.actor_email ?? "—"}</td>
                  <td>
                    <code>{e.action}</code>
                  </td>
                  <td className="muted">
                    {e.resource_type ? `${e.resource_type}#${e.resource_id ?? "—"}` : "—"}
                  </td>
                  <td className="muted" style={{ maxWidth: 360, fontSize: 12.5 }}>
                    {Object.keys(e.details).length ? JSON.stringify(e.details) : "—"}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: 30, textAlign: "center" }}>
                    No audit entries.
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