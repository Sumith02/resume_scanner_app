import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../lib/auth";
import { Alert } from "../components/ui";

export function SetupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "Platform Administrator", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.bootstrap(form);
      await login(form.email, form.password);
      navigate("/master");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
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
        <h1>Platform setup</h1>
        <div className="sub">Create the Master Admin that provisions all customer companies.</div>

        {error && <Alert kind="error">{error}</Alert>}

        <div className="field">
          <label>Your name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="admin@nexerra.io"
            required
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="At least 8 characters"
            required
            minLength={8}
          />
        </div>

        <button className="btn primary block" disabled={busy}>
          {busy ? "Creating…" : "Create Master Admin"}
        </button>

        <div className="mt-2" style={{ textAlign: "center", fontSize: 13 }}>
          <Link to="/login">Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}