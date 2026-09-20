import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Alert } from "../components/ui";

export function SetPasswordPage() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const updated = await changePassword(current, next);
      navigate(updated.role === "MASTER_ADMIN" ? "/master" : "/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="logo">N</div>
          <strong>Nexerra Talent OS</strong>
        </div>
        <h1>Set a new password</h1>
        <div className="sub">
          <KeyRound size={13} /> {user?.email} · your temporary password must be replaced.
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        <div className="field">
          <label>Temporary password</label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="From your invitation email"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>New password</label>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="At least 8 characters"
            required
          />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        <button className="btn primary block" disabled={busy}>
          {busy ? "Saving…" : "Set password & continue"}
        </button>

        <div className="mt-2" style={{ textAlign: "center", fontSize: 13 }}>
          <button
            type="button"
            className="linklike"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}
