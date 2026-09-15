import React, { useState } from "react";
import { type Session } from "@supabase/supabase-js";
import { supabase, isSupabaseBrowserConfigured } from "./supabaseClient";
import {
  Lock,
  Mail,
  User,
  Building,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Zap,
  Sparkles,
  Network,
  EyeOff,
  Database
} from "lucide-react";

interface AuthGateProps {
  onAuthSuccess: (session: Session) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthSuccess }) => {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!isSupabaseBrowserConfigured || !supabase) {
      setErrorMsg("Database authentication is initializing. Please verify Supabase keys in settings.");
      return;
    }

    setLoading(true);

    try {
      if (tab === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;
        if (!data.session) throw new Error("Could not start session. Please try again.");

        setSuccessMsg("Signed in! Launching your workspace...");
        setTimeout(() => {
          onAuthSuccess(data.session);
        }, 400);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              organization_name: orgName.trim() || "My Company Workspace"
            }
          }
        });

        if (error) throw error;

        if (data.session) {
          setSuccessMsg("Account created! Launching your workspace...");
          setTimeout(() => {
            onAuthSuccess(data.session!);
          }, 400);
        } else {
          setSuccessMsg(
            "Account created! Please check your email inbox to verify your account, or sign in if confirmation is disabled."
          );
          setTab("signin");
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed. Please check credentials.";
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
      {/* LEFT COLUMN: BRAND & VALUE PROPOSITION */}
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
          {/* HEADER */}
          <div style={{ marginBottom: "28px" }}>
            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 6px 0" }}>
              {tab === "signin" ? "Recruiter Portal Sign In" : "Create Recruiter Account"}
            </h2>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
              {tab === "signin"
                ? "Sign in to access your company's candidate intelligence database."
                : "Register your company or recruitment agency workspace."}
            </p>
          </div>

          {/* TAB SWITCHER */}
          <div
            style={{
              display: "flex",
              marginBottom: "24px",
              background: "rgba(255, 255, 255, 0.06)",
              borderRadius: "8px",
              padding: "4px"
            }}
          >
            <button
              type="button"
              onClick={() => {
                setTab("signin");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              style={{
                flex: 1,
                padding: "8px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                background: tab === "signin" ? "#2563eb" : "transparent",
                color: "#ffffff",
                transition: "all 0.15s ease"
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("signup");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              style={{
                flex: 1,
                padding: "8px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                background: tab === "signup" ? "#2563eb" : "transparent",
                color: "#ffffff",
                transition: "all 0.15s ease"
              }}
            >
              Create Account
            </button>
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

          {/* FORM */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {tab === "signup" && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                    Full Name
                  </label>
                  <div style={{ position: "relative" }}>
                    <User size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Alex Henderson"
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
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                    Company or Agency Name
                  </label>
                  <div style={{ position: "relative" }}>
                    <Building size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                    <input
                      type="text"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g. Acme Corp / TechStaff Agency"
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
              </>
            )}

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                Work Email Address
              </label>
              <div style={{ position: "relative" }}>
                <Mail size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="recruiter@company.com"
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
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "10px",
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
              {loading && <Loader2 size={16} className="spinning" />}
              <span>{tab === "signin" ? "Sign In to Talent OS" : "Create Recruiter Account"}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
