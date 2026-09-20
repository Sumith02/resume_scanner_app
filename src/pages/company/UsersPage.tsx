import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { api } from "../../api";
import { Alert, Modal, StatusBadge } from "../../components/ui";
import { InviteBox } from "../../components/InviteBox";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import { formatDate, roleLabel } from "../../lib/format";
import type { Role, Seats, User } from "../../types";

const ASSIGNABLE: Role[] = [
  "COMPANY_ADMIN",
  "RECRUITER",
  "HIRING_MANAGER",
  "INTERVIEWER",
  "READ_ONLY",
];

export function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [seats, setSeats] = useState<Seats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  async function load() {
    try {
      const [u, s] = await Promise.all([api.listUsers(), api.seats()]);
      setUsers(u);
      setSeats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function update(target: User, patch: { role?: string; status?: string }) {
    setError(null);
    try {
      await api.updateUser(target.id, patch);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function requestSeats() {
    try {
      await api.requestSeats("Need more recruiting seats");
      setNotice("Seat request submitted to the platform administrator.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }

  const full = seats ? seats.available === 0 : false;

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="page-head">
        <div>
          <h1>Users & Seats</h1>
          <div className="sub">
            {seats
              ? `${seats.used} of ${seats.limit} seats used · ${seats.available} available`
              : "Loading seat allocation…"}
          </div>
        </div>
        <div className="flex">
          <button className="btn ghost" disabled={!full} onClick={requestSeats} title={full ? "" : "Seats still available"}>
            Request seats
          </button>
          {can(user, "user:create") && (
            <button className="btn primary" disabled={full} onClick={() => setShowInvite(true)}>
              <UserPlus size={16} /> Invite user
            </button>
          )}
        </div>
      </div>

      {full && (
        <Alert kind="info">
          All seats are in use. Submit a seat request for the platform administrator to review.
        </Alert>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 650 }}>{u.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {u.email}
                    </div>
                  </td>
                  <td>
                    {can(user, "user:manage") && u.id !== user?.id ? (
                      <select
                        value={u.role}
                        style={{ width: 170 }}
                        onChange={(e) => update(u, { role: e.target.value })}
                      >
                        <option value="COMPANY_OWNER">{roleLabel("COMPANY_OWNER")}</option>
                        {ASSIGNABLE.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      roleLabel(u.role)
                    )}
                  </td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="muted">{formatDate(u.last_login_at)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {can(user, "user:manage") && u.id !== user?.id && (
                      <>
                        {u.status === "INACTIVE" || u.status === "SUSPENDED" ? (
                          <button className="btn sm ghost" onClick={() => update(u, { status: "ACTIVE" })}>
                            Reactivate
                          </button>
                        ) : (
                          <>
                            <button
                              className="btn sm ghost"
                              onClick={() => update(u, { status: "SUSPENDED" })}
                            >
                              Suspend
                            </button>{" "}
                            <button
                              className="btn sm ghost"
                              onClick={() => update(u, { status: "INACTIVE" })}
                            >
                              Deactivate
                            </button>
                          </>
                        )}
                      </>
                    )}
                    {u.id === user?.id && <span className="muted">You</span>}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: 30, textAlign: "center" }}>
                    No users.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function InviteUserModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [form, setForm] = useState({ email: "", name: "", role: "RECRUITER" as Role });
  const [result, setResult] = useState<{ email: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createUser(form);
      setResult({ email: res.user.email, token: res.invite_token });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Invite user"
      onClose={onClose}
      footer={
        result ? (
          <button className="btn primary" onClick={onInvited}>
            Done
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || !form.email} onClick={submit}>
              {busy ? "Sending…" : "Send invitation"}
            </button>
          </>
        )
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      {result ? (
        <>
          <Alert kind="success">Invitation created. The user occupies one seat once active.</Alert>
          <InviteBox email={result.email} token={result.token} />
        </>
      ) : (
        <>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {ASSIGNABLE.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </div>
          <Alert kind="info">
            Seats are enforced server-side: if the allocation is full, the invite is rejected.
          </Alert>
        </>
      )}
    </Modal>
  );
}