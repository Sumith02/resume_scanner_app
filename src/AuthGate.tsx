import React, { useState } from "react";
import { type Session } from "@supabase/supabase-js";
import { supabase, isSupabaseBrowserConfigured } from "./supabaseClient";
import { completePasswordChange } from "./api";
import {
  Lock,
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Zap,
  Sparkles,
  Network,
  EyeOff,
  Database,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  Info
} from "lucide-react";

interface AuthGateProps {
  onAuthSuccess: (session: Session) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthSuccess }) => {
  const [step, setStep] = useState<"signin" | "first_login_password_change">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const isMasterAdmin = email.trim().toLowerCase() === "sumithsbhatt@gmail.com";

  async function handleBootstrapMasterAdmin() {
    if (!password || password.length < 6) {
      setErrorMsg("Please enter at least 6 characters in the password field to set as your Master Admin password.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("Configuring Master Admin credentials and signing you in...");
    try {
      // 1. Call server-side master bootstrap endpoint to set password directly in Supabase
      const resp = await fetch("/api/auth/master-bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "sumithsbhatt@gmail.com", password })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const detailMsg =
          errData.detail?.message ||
          (typeof errData.detail === "string" ? errData.detail : null);
        throw new Error(detailMsg || "Failed to initialize master admin credentials on server.");
      }

      // 2. Immediately sign in with the new password
      if (isSupabaseBrowserConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: "sumithsbhatt@gmail.com",
          password
        });
        if (error) throw error;
        if (data.session) {
          setSuccessMsg("Master Admin authenticated! Launching your workspace...");
          setTimeout(() => onAuthSuccess(data.session!), 400);
          return;
        }
      }

      // 3. Fallback for local mock mode
      setSuccessMsg("Master Admin authenticated! Launching your workspace...");
      setTimeout(() => {
        onAuthSuccess({
          access_token: "master-admin-token",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "master-admin-refresh",
          user: {
            id: "usr-master-admin",
            email: "sumithsbhatt@gmail.com",
            app_metadata: {},
            user_metadata: { full_name: "Sumith Bhatt", role: "owner" },
            aud: "authenticated",
            created_at: new Date().toISOString()
          }
        } as unknown as Session);
      }, 400);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to initialize master admin account.");
      setSuccessMsg("");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetMasterAdminPassword() {
    if (!isSupabaseBrowserConfigured || !supabase) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail("sumithsbhatt@gmail.com", {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      setSuccessMsg("Password reset link has been dispatched to sumithsbhatt@gmail.com. Check your email inbox.");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!isSupabaseBrowserConfigured || !supabase) {
      // Local dev mode fallback
      setSuccessMsg(
        isMasterAdmin
          ? "Logged in as Master Administrator! Launching workspace..."
          : "Connected in Local Mode! Launching workspace..."
      );
      const userEmail = email.trim() || (isMasterAdmin ? "sumithsbhatt@gmail.com" : "admin@workspace.local");
      setTimeout(() => {
        onAuthSuccess({
          access_token: `local:${userEmail}`,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "local-refresh",
          user: {
            id: isMasterAdmin ? "master-admin" : `usr-${userEmail.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`,
            app_metadata: {},
            user_metadata: { full_name: isMasterAdmin ? "Sumith Bhatt (Master Admin)" : userEmail.split("@")[0], role: isMasterAdmin ? "owner" : "recruiter" },
            aud: "authenticated",
            created_at: new Date().toISOString(),
            email: userEmail
          }
        } as Session);
      }, 400);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) throw error;
      if (!data.session) throw new Error("Could not start session. Please try again.");

      const mustChange =
        !isMasterAdmin &&
        Boolean(
          data.session.user?.user_metadata?.must_change_password ||
          data.session.user?.user_metadata?.temporary_password
        );

      if (mustChange) {
        setActiveSession(data.session);
        setStep("first_login_password_change");
        setSuccessMsg("Temporary password confirmed. Please set your permanent password to continue.");
      } else {
        setSuccessMsg(
          isMasterAdmin
            ? "Welcome Master Admin! Launching your workspace..."
            : "Signed in! Launching your workspace..."
        );
        setTimeout(() => {
          onAuthSuccess(data.session);
        }, 400);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed. Please check your credentials.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (newPassword.length < 6) {
      setErrorMsg("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please re-enter.");
      return;
    }

    if (newPassword === password) {
      setErrorMsg("Your new permanent password must be different from the temporary password.");
      return;
    }

    setLoading(true);

    try {
      if (isSupabaseBrowserConfigured && supabase) {
        const { data, error } = await supabase.auth.updateUser({
          password: newPassword,
          data: {
            must_change_password: false,
            temporary_password: false
          }
        });

        if (error) throw error;

        try {
          await completePasswordChange();
        } catch {
          // Backend completion is non-blocking
        }

        setSuccessMsg("Permanent password saved! Launching your workspace...");
        const finalSession = data.user
          ? ({ ...activeSession, user: data.user } as Session)
          : activeSession;

        setTimeout(() => {
          if (finalSession) {
            onAuthSuccess(finalSession);
          }
        }, 450);
      } else {
        setSuccessMsg("Permanent password saved! Launching your workspace...");
        setTimeout(() => {
          if (activeSession) onAuthSuccess(activeSession);
        }, 400);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update password. Please try again.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: "linear-gradient(135deg, #090d16 0%, #0f172a 50%, #1e293b 100%)",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      {/* LEFT COLUMN: BRAND & PLATFORM PILLARS */}
      <div
        style={{
          flex: 1,
          padding: "60px 48px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          borderRight: "1px solid rgba(255, 255, 255, 0.08)",
          background: "radial-gradient(ellipse at top left, rgba(59, 130, 246, 0.12) 0%, transparent 70%)"
        }}
        className="auth-branding-col"
      >
        <div>
          {/* LOGO */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "40px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 8px 24px rgba(37, 99, 235, 0.4)"
              }}
            >
              <Zap size={24} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em" }}>NEXERRA</div>
              <div style={{ fontSize: "11px", letterSpacing: "0.14em", color: "#60a5fa", fontWeight: 700 }}>
                TALENT OS V11
              </div>
            </div>
          </div>

          <h1 style={{ fontSize: "36px", fontWeight: 800, lineHeight: 1.2, margin: "0 0 16px 0", maxWidth: "520px" }}>
            Autonomous Talent Intelligence & Candidate Memory
          </h1>
          <p style={{ fontSize: "16px", color: "#94a3b8", lineHeight: 1.6, maxWidth: "480px", margin: "0 0 40px 0" }}>
            Turn every resume into reusable intelligence. Rediscover overlooked candidates, map talent relationships,
            and manage agency hiring in one secure platform.
          </p>

          {/* 4 HIGHLIGHT PILLARS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px", maxWidth: "540px" }}>
            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.07)"
              }}
            >
              <Sparkles size={20} color="#38bdf8" style={{ marginBottom: "8px" }} />
              <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>Talent Rediscovery</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.4 }}>
                Instant AI matching against your existing candidate database.
              </div>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.07)"
              }}
            >
              <Network size={20} color="#818cf8" style={{ marginBottom: "8px" }} />
              <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>Talent Graph Engine</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.4 }}>
                Multi-relational graph mapping candidates to skills, companies & education.
              </div>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.07)"
              }}
            >
              <Database size={20} color="#34d399" style={{ marginBottom: "8px" }} />
              <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>Mailbox & PDF Ingestion</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.4 }}>
                Auto-filter invoices and ingest only verified candidate resumes.
              </div>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.07)"
              }}
            >
              <EyeOff size={20} color="#f472b6" style={{ marginBottom: "8px" }} />
              <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>Blind Screening</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.4 }}>
                Audit-trailed identity masking to eliminate recruitment bias.
              </div>
            </div>
          </div>
        </div>

        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "32px" }}>
          © 2026 Nexerra Talent OS. Enterprise Candidate Intelligence.
        </div>
      </div>

      {/* RIGHT COLUMN: AUTHENTICATION FORM */}
      <div
        style={{
          width: "480px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "48px 40px",
          background: "#0b1329"
        }}
      >
        <div style={{ maxWidth: "380px", width: "100%", margin: "0 auto" }}>
          {step === "signin" ? (
            <>
              {/* HEADER */}
              <div style={{ marginBottom: "24px" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    background: "rgba(59, 130, 246, 0.12)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    color: "#93c5fd",
                    fontSize: "11px",
                    fontWeight: 600,
                    marginBottom: "12px"
                  }}
                >
                  <ShieldCheck size={13} />
                  Enterprise Protected
                </div>
                <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 6px 0" }}>
                  Workspace Sign In
                </h2>
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
                  Enter your work email and password to access your organization's talent database.
                </p>
              </div>

              {/* ADMIN PROVISION NOTICE */}
              <div
                style={{
                  marginBottom: "20px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "rgba(30, 41, 59, 0.7)",
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  fontSize: "12px",
                  lineHeight: "1.5",
                  color: "#cbd5e1",
                  display: "flex",
                  gap: "10px"
                }}
              >
                <Info size={16} color="#60a5fa" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong style={{ color: "#ffffff" }}>Admin-Provisioned Accounts:</strong>
                  <div style={{ marginTop: "2px", color: "#94a3b8" }}>
                    User accounts are created by workspace admins. If your account was newly provisioned, use the temporary password sent to your email.
                  </div>
                </div>
              </div>

              {/* ERROR ALERT */}
              {errorMsg && (
                <div
                  style={{
                    marginBottom: "18px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#fca5a5",
                    fontSize: "13px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{errorMsg}</span>
                  </div>
                  {isMasterAdmin && (
                    <div style={{ marginTop: "8px", paddingTop: "10px", borderTop: "1px solid rgba(239, 68, 68, 0.3)", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ fontSize: "12px", color: "#fef08a", fontWeight: 600 }}>
                        👑 Master Admin Action Required:
                      </div>
                      <div style={{ fontSize: "11px", color: "#e2e8f0", lineHeight: 1.4 }}>
                        If this is your first time signing in or you forgot your password, enter your desired password in the box below and click this button:
                      </div>
                      <button
                        type="button"
                        onClick={handleBootstrapMasterAdmin}
                        disabled={loading}
                        style={{
                          padding: "9px 14px",
                          background: "#d97706",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          boxShadow: "0 2px 8px rgba(217, 119, 6, 0.3)"
                        }}
                      >
                        <KeyRound size={14} />
                        <span>Initialize / Register Master Admin with this Password</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetMasterAdminPassword}
                        disabled={loading}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#93c5fd",
                          fontSize: "11px",
                          cursor: "pointer",
                          textDecoration: "underline",
                          textAlign: "left"
                        }}
                      >
                        Forgot password? Send password reset email to sumithsbhatt@gmail.com
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SUCCESS ALERT */}
              {successMsg && (
                <div
                  style={{
                    marginBottom: "18px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(34, 197, 94, 0.15)",
                    border: "1px solid rgba(34, 197, 94, 0.4)",
                    color: "#86efac",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* FORM */}
              <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label
                    style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}
                  >
                    Work Email Address
                  </label>
                  <div style={{ position: "relative" }}>
                    <Mail
                      size={16}
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b"
                      }}
                    />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 38px",
                        borderRadius: "8px",
                        border: isMasterAdmin ? "1px solid rgba(234, 179, 8, 0.6)" : "1px solid rgba(255, 255, 255, 0.15)",
                        background: isMasterAdmin ? "rgba(234, 179, 8, 0.08)" : "rgba(255, 255, 255, 0.05)",
                        color: "#ffffff",
                        fontSize: "14px",
                        outline: "none",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>
                  {isMasterAdmin && (
                    <div
                      style={{
                        marginTop: "6px",
                        fontSize: "11px",
                        color: "#fde047",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                    >
                      👑 Master Administrator Account (Automatic Owner & Admin Access)
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "#cbd5e1" }}>
                      Password or Temporary Password
                    </label>
                  </div>
                  <div style={{ position: "relative" }}>
                    <Lock
                      size={16}
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b"
                      }}
                    />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 38px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        background: "rgba(255, 255, 255, 0.05)",
                        color: "#ffffff",
                        fontSize: "14px",
                        outline: "none",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>
                  {isMasterAdmin && (
                    <div style={{ marginTop: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                        Need to set or reset your password?
                      </span>
                      <button
                        type="button"
                        onClick={handleBootstrapMasterAdmin}
                        disabled={loading}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#f59e0b",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: "pointer",
                          textDecoration: "underline",
                          padding: "0"
                        }}
                      >
                        Set password & log in
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: "8px",
                    padding: "12px",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                    color: "#ffffff",
                    fontWeight: 600,
                    fontSize: "14px",
                    border: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 4px 16px rgba(37, 99, 235, 0.35)"
                  }}
                >
                  {loading ? <Loader2 size={16} className="spinning" /> : <ArrowRight size={16} />}
                  <span>Sign In to Talent OS</span>
                </button>
              </form>

              {/* FOOTNOTE */}
              <div style={{ marginTop: "24px", textAlign: "center", fontSize: "12px", color: "#64748b" }}>
                Need access? Request an account invitation from your team administrator.
              </div>
            </>
          ) : (
            <>
              {/* FIRST LOGIN: SET PERMANENT PASSWORD */}
              <div style={{ marginBottom: "22px" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    background: "rgba(234, 179, 8, 0.15)",
                    border: "1px solid rgba(234, 179, 8, 0.4)",
                    color: "#fde047",
                    fontSize: "11px",
                    fontWeight: 600,
                    marginBottom: "12px"
                  }}
                >
                  <KeyRound size={13} />
                  Mandatory Security Step
                </div>
                <h2 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px 0" }}>
                  Create Your Permanent Password
                </h2>
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
                  You logged in with a temporary password for <strong style={{ color: "#ffffff" }}>{email}</strong>. Please set a secure permanent password to activate your workspace access.
                </p>
              </div>

              {/* ERROR ALERT */}
              {errorMsg && (
                <div
                  style={{
                    marginBottom: "18px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#fca5a5",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* SUCCESS ALERT */}
              {successMsg && (
                <div
                  style={{
                    marginBottom: "18px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(34, 197, 94, 0.15)",
                    border: "1px solid rgba(34, 197, 94, 0.4)",
                    color: "#86efac",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* PASSWORD FORM */}
              <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label
                    style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}
                  >
                    New Permanent Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <Lock
                      size={16}
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b"
                      }}
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 38px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        background: "rgba(255, 255, 255, 0.05)",
                        color: "#ffffff",
                        fontSize: "14px",
                        outline: "none",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}
                  >
                    Confirm Permanent Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <Lock
                      size={16}
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b"
                      }}
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 38px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        background: "rgba(255, 255, 255, 0.05)",
                        color: "#ffffff",
                        fontSize: "14px",
                        outline: "none",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    fontSize: "11px",
                    color: "#94a3b8",
                    padding: "8px 10px",
                    background: "rgba(255, 255, 255, 0.03)",
                    borderRadius: "6px"
                  }}
                >
                  🔒 Once set, your temporary password expires immediately and cannot be used again.
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: "8px",
                    padding: "12px",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: "#ffffff",
                    fontWeight: 600,
                    fontSize: "14px",
                    border: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 4px 16px rgba(16, 185, 129, 0.35)"
                  }}
                >
                  {loading ? <Loader2 size={16} className="spinning" /> : <ShieldCheck size={16} />}
                  <span>Save Password & Enter Workspace</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep("signin");
                    setPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setErrorMsg("");
                    setSuccessMsg("");
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "12px",
                    cursor: "pointer",
                    padding: "6px"
                  }}
                >
                  ← Return to sign in
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
