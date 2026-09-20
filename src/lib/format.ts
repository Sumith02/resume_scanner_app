const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  PARSED: "Parsed",
  IN_REVIEW: "In Review",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  ONBOARDING: "Onboarding",
  PLACED: "Placed",
  REJECTED: "Rejected",
};

const STAGE_COLORS: Record<string, string> = {
  NEW: "#64748b",
  PARSED: "#0ea5e9",
  IN_REVIEW: "#6366f1",
  SHORTLISTED: "#8b5cf6",
  INTERVIEW: "#f59e0b",
  OFFER: "#ec4899",
  ONBOARDING: "#14b8a6",
  PLACED: "#22c55e",
  REJECTED: "#ef4444",
};

const ROLE_LABELS: Record<string, string> = {
  MASTER_ADMIN: "Master Admin",
  COMPANY_OWNER: "Company Owner",
  COMPANY_ADMIN: "Company Admin",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring Manager",
  INTERVIEWER: "Interviewer",
  READ_ONLY: "Read Only",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function stageColor(stage: string): string {
  return STAGE_COLORS[stage] ?? "#64748b";
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export const PIPELINE_STAGES = [
  "NEW",
  "PARSED",
  "IN_REVIEW",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFER",
  "ONBOARDING",
  "PLACED",
  "REJECTED",
] as const;