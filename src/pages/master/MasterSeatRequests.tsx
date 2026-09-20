import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, StatusBadge } from "../../components/ui";
import { formatDate } from "../../lib/format";
import type { SeatRequest } from "../../types";

export function MasterSeatRequests() {
  const [requests, setRequests] = useState<SeatRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      setRequests(await api.listSeatRequests());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load seat requests");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(req: SeatRequest, approve: boolean) {
    setError(null);
    try {
      await api.reviewSeatRequest(req.id, approve);
      setNotice(`${approve ? "Approved" : "Rejected"} seat request for ${req.company_name ?? "company"}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    }
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const reviewed = requests.filter((r) => r.status !== "PENDING");

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="page-head">
        <div>
          <h1>Seat Requests</h1>
          <div className="sub">Approve additional seats beyond a company's allocated quota.</div>
        </div>
      </div>

      <div className="card">
        <h3>Pending review</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Current → Requested</th>
                <th>Reason</th>
                <th>Requested</th>
                <th style={{ textAlign: "right" }}>Decision</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.company_name ?? `#${r.organization_id}`}</td>
                  <td>
                    <strong>{r.current_seats}</strong>
                    <span className="muted"> → </span>
                    <strong>{r.requested_seats}</strong>
                  </td>
                  <td className="muted">{r.reason ?? "—"}</td>
                  <td className="muted">{formatDate(r.created_at)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn sm primary" onClick={() => review(r, true)}>
                      <Check size={14} /> Approve
                    </button>{" "}
                    <button className="btn sm ghost" onClick={() => review(r, false)}>
                      <X size={14} /> Reject
                    </button>
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <Empty title="No pending requests" hint="Companies within their quota need no action." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-2">
        <h3>History</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Requested seats</th>
                <th>Status</th>
                <th>Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {reviewed.map((r) => (
                <tr key={r.id}>
                  <td>{r.company_name ?? `#${r.organization_id}`}</td>
                  <td>{r.requested_seats}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="muted">{formatDate(r.created_at)}</td>
                </tr>
              ))}
              {reviewed.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No historical decisions yet.
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