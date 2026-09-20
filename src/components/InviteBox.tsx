import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function inviteLink(email: string, token: string): string {
  const base = `${window.location.origin}/invite`;
  return `${base}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

export function InviteBox({ email, token }: { email: string; token: string }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(email, token);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="alert info" style={{ wordBreak: "break-all" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Invitation link (share with {email})
      </div>
      <div style={{ fontSize: 12.5, marginBottom: 8 }}>{link}</div>
      <button type="button" className="btn sm ghost" onClick={copy}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}