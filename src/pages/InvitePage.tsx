import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Alert } from "../components/ui";

export function InvitePage() {
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await acceptInvite(email, token, password);
      navigate(user.role === "MASTER_ADMIN" ? "/master" : "/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
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
        <h1>Activate your account</h1>
        <div className="sub">Set a password to accept your invitation.</div>

        {error && <Alert kind="error">{error}</Alert>}
        {!params.get("token") && (
          <Alert kind="info">Paste the invitation token your administrator shared with you.</Alert>
        )}

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Invitation token</label>
          <input value={token} onChange={(e) => setToken(e.target.value)} required />
        </div>
        <div className="field">
          <label>New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="At least 8 characters"
          />
        </div>

        <button className="btn primary block" disabled={busy}>
          {busy ? "Activating…" : "Activate account"}
        </button>

        <div className="mt-2" style={{ textAlign: "center", fontSize: 13 }}>
          <Link to="/login">Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}