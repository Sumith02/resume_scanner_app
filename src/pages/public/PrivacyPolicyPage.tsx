import { Link } from "react-router-dom";
import { ShieldCheck, Mail, ArrowLeft } from "lucide-react";

export function PrivacyPolicyPage() {
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
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Privacy Policy &amp; Google API Disclosure</p>
        </div>
      </div>

      <p style={{ fontSize: 13, color: "#64748b", borderBottom: "1px solid #e2e8f0", paddingBottom: 16 }}>
        <strong>Effective Date:</strong> January 1, 2026 | <strong>Last Updated:</strong> September 20, 2026
      </p>

      <div style={{ lineHeight: 1.7, fontSize: 15, color: "#334155" }}>
        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>1. Introduction</h2>
        <p>
          Nexerra Talent OS ("we", "our", or "the Platform") provides an intelligent talent acquisition and recruitment management operating system. We respect your privacy and are committed to protecting candidate and recruiter data.
        </p>

        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>2. Information We Collect</h2>
        <p>When you use Nexerra Talent OS, we may collect:</p>
        <ul>
          <li><strong>Account Information:</strong> Name, work email address, company name, and encrypted authentication credentials.</li>
          <li><strong>Recruitment Data:</strong> Candidate resumes, job descriptions, interview feedback, and hiring stage transitions.</li>
          <li><strong>Google Account Data (when authorized):</strong> When connecting your inbox, we request access to read inbound job application emails and resume attachments via Google OAuth.</li>
        </ul>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", margin: "24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <ShieldCheck size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#0f172a" }}>
              Google API Services User Data Policy Compliance
            </h3>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#475569" }}>
            Nexerra Talent OS’s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <ul style={{ margin: "12px 0 0", paddingLeft: 20, fontSize: 14, color: "#475569" }}>
            <li>We only access Gmail messages to detect job application emails and extract attached resumes.</li>
            <li>We do <strong>not</strong> sell your Google data to third parties.</li>
            <li>We do <strong>not</strong> use your Google data for serving personalized advertising.</li>
            <li>We do <strong>not</strong> allow humans to read your emails unless explicitly requested for technical debugging with your consent.</li>
          </ul>
        </div>

        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>3. How We Use Your Information</h2>
        <p>We use collected data solely to:</p>
        <ul>
          <li>Parse and organize candidate resumes into talent pipelines.</li>
          <li>Enable multi-tenant recruitment workflows for authorized team members.</li>
          <li>Calculate candidate skill matches and generate interview scorecards.</li>
          <li>Deliver automated applicant tracking notifications and updates.</li>
        </ul>

        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>4. Data Security and Multi-Tenancy</h2>
        <p>
          All customer data is strictly isolated by organization tenant ID. We implement industry-standard encryption in transit (TLS 1.3) and encryption at rest. OAuth tokens are stored securely in protected storage and refreshed automatically.
        </p>

        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>5. Revocation and Deletion of Data</h2>
        <p>
          You may disconnect your Google account at any time via the Email settings page in your dashboard, or by visiting{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
            Google Security Settings
          </a>
          . Upon disconnection, stored OAuth access tokens are permanently deleted.
        </p>

        <h2 style={{ fontSize: 18, color: "#0f172a", marginTop: 28, marginBottom: 8 }}>6. Contact Us</h2>
        <p>
          If you have questions about this Privacy Policy or your data, please contact our support team at:
        </p>
        <p style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500, color: "#0f172a" }}>
          <Mail size={16} /> support@nexerratalent.com / sumithsbhatt@gmail.com
        </p>
      </div>

      <div style={{ marginTop: 40, borderTop: "1px solid #e2e8f0", paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 13, color: "#94a3b8" }}>
        <span>&copy; {new Date().getFullYear()} Nexerra Talent OS. All rights reserved.</span>
        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/terms" style={{ color: "#64748b", textDecoration: "none" }}>Terms of Service</Link>
          <Link to="/login" style={{ color: "#64748b", textDecoration: "none" }}>Sign In</Link>
        </div>
      </div>
    </div>
  );
}
