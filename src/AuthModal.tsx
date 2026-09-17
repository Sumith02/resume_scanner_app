import React, { useState } from "react";
import { type Session } from "@supabase/supabase-js";
import { supabase, isSupabaseBrowserConfigured } from "./supabaseClient";
import { completePasswordChange } from "./api";
import { X, Lock, Mail, Loader2, AlertCircle, CheckCircle2, ShieldCheck, KeyRound } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (session: Session | null) => void;
  onContinueAsGuest: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onContinueAsGuest
}) => {
  const [step, setStep] = useState<"signin" | "first_login_password_change">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!isSupabaseBrowserConfigured || !supabase) {
      setErrorMsg("Supabase is not configured yet. You can continue in Guest/Demo mode.");
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

      const isMaster = email.trim().toLowerCase() === "sumithsbhatt@gmail.com";
      const mustChange = !isMaster && Boolean(
        data.session.user?.user_metadata?.must_change_password ||
        data.session.user?.user_metadata?.temporary_password
      );

      if (mustChange) {
        setActiveSession(data.session);
        setStep("first_login_password_change");
        setSuccessMsg("Temporary password confirmed. Please set your permanent password to continue.");
      } else {
        setSuccessMsg(isMaster ? "Welcome Master Admin! Launching workspace..." : "Signed in successfully!");
        setTimeout(() => {
          onSuccess(data.session);
          onClose();
        }, 450);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed. Please check credentials.";
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
      setErrorMsg("Permanent password must be at least 6 characters.");
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
          // Backend completion
        }

        setSuccessMsg("Permanent password saved! Logging in...");
        const finalSession = data.user
          ? ({ ...activeSession, user: data.user } as Session)
          : activeSession;

        setTimeout(() => {
          onSuccess(finalSession);
          onClose();
        }, 450);
      } else {
        setSuccessMsg("Permanent password saved! Logging in...");
        setTimeout(() => {
          onSuccess(activeSession);
          onClose();
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
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: "16px"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "first_login_password_change") onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: "24px 24px 18px",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "#ffffff",
            position: "relative"
          }}
        >
          {step !== "first_login_password_change" && (
            <button
              type="button"
              onClick={onClose}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "rgba(255, 255, 255, 0.1)",
                border: "none",
                borderRadius: "50%",
                width: "28px",
                height: "28px",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                color: "#94a3b8"
              }}
            >
              <X size={16} />
            </button>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 2px 8px rgba(59, 130, 246, 0.5)"
              }}
            >
              <ShieldCheck size={16} color="#ffffff" />
            </div>
            <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#60a5fa" }}>
              RESUME SCANNER
            </span>
          </div>

          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "4px 0 2px" }}>
            {step === "signin" ? "Recruiter Portal Sign In" : "Set Permanent Password"}
          </h2>
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
            {step === "signin"
              ? "Sign in with your work email and temporary or permanent password"
              : `Create your permanent password for ${email}`}
          </p>
        </div>

        {/* MODAL FORM */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {errorMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
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

          {successMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                color: "#15803d",
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

          {step === "signin" ? (
            <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  fontSize: "12px",
                  color: "#64748b",
                  lineHeight: 1.4
                }}
              >
                🔒 <strong>Admin-Managed Access:</strong> Only administrators can provision user accounts. Enter your temporary password received by email.
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  Work Email Address
                </label>
                <div style={{ position: "relative" }}>
                  <Mail size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
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
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  Password or Temporary Password
                </label>
                <div style={{ position: "relative" }}>
                  <Lock size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
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
                      border: "1px solid #cbd5e1",
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
                  marginTop: "8px",
                  padding: "10px 16px",
                  borderRadius: "8px",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "14px",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px"
                }}
              >
                {loading && <Loader2 size={16} className="spinning" />}
                <span>Sign In</span>
              </button>

              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px", textAlign: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    onContinueAsGuest();
                    onClose();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    fontSize: "12px",
                    cursor: "pointer",
                    textDecoration: "underline"
                  }}
                >
                  Continue in Guest / Demo Mode
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "#fefce8",
                  border: "1px solid #fef08a",
                  fontSize: "12px",
                  color: "#854d0e",
                  lineHeight: 1.4,
                  display: "flex",
                  gap: "8px",
                  alignItems: "center"
                }}
              >
                <KeyRound size={16} style={{ flexShrink: 0 }} />
                <span>Because this is your first time logging in, you must choose a secure permanent password.</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  New Permanent Password
                </label>
                <div style={{ position: "relative" }}>
                  <Lock size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
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
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  Confirm Permanent Password
                </label>
                <div style={{ position: "relative" }}>
                  <Lock size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    style={{
                      width: "100%",
                      padding: "10px 12px 10px 38px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
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
                  marginTop: "8px",
                  padding: "10px 16px",
                  borderRadius: "8px",
                  background: "#059669",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "14px",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px"
                }}
              >
                {loading && <Loader2 size={16} className="spinning" />}
                <span>Save Password & Launch Workspace</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
