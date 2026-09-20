import { Link } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";

export function TermsPage() {
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px", color: "#1e293b", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ marginBottom: 32 }}>
        <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#2563eb", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
          <ArrowLeft size={16} /> Back to Sign In
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: "linear-gradient(135deg, #2563eb, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 20 }}>
          N
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#0f172a" }}>Nexerra Talent OS</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Terms of Service</p>
        </div>
      </div>

      <p style={{ fontSize: 13, color: "#64748b", borderBottom: "1px solid #e2e8f0", paddingBottom: 16 }}>
        <strong>Effective Date:</strong> January 1, 2026 | <strong>Last Updated:</strong> September 20, 2026
      </p>

      <div style={{ lineHeight: 1.7, fontSize: 15, color: "#334155" }}>
        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>1. Acceptance of Terms</h2>
        <p>
          By creating an account or accessing Nexerra Talent OS ("the Service"), you agree to be bound by these Terms of Service. If you are using the Service on behalf of an organization, you agree to these Terms on behalf of that organization.
        </p>

        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>2. Service Description</h2>
        <p>
          Nexerra Talent OS is a recruitment automation platform enabling organizations to manage candidate pipelines, sync job application emails, parse resumes, and conduct structured hiring processes.
        </p>

        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>3. User Obligations &amp; Account Security</h2>
        <p>
          You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You agree not to use the Service for any unlawful recruitment activities or unauthorized harvesting of personal data.
        </p>

        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>4. Third-Party Integrations</h2>
        <p>
          The Service integrates with third-party providers including Google APIs for Gmail synchronization. Your use of such integrations is subject to the third party's terms and privacy policies.
        </p>

        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>5. Termination</h2>
        <p>
          We reserve the right to suspend or terminate accounts that violate these Terms or misuse the platform infrastructure.
        </p>

        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>6. Contact Information</h2>
        <p style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500, color: "#0f172a" }}>
          <Mail size={16} /> support@nexerratalent.com / sumithsbhatt@gmail.com
        </p>
      </div>

      <div style={{ marginTop: 40, borderTop: "1px solid #e2e8f0", paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 13, color: "#94a3b8" }}>
        <span>&copy; {new Date().getFullYear()} Nexerra Talent OS. All rights reserved.</span>
        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/privacy" style={{ color: "#64748b", textDecoration: "none" }}>Privacy Policy</Link>
          <Link to="/login" style={{ color: "#64748b", textDecoration: "none" }}>Sign In</Link>
        </div>
      </div>
    </div>
  );
}
