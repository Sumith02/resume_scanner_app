import type { CandidateApplication, FilterState, SortKey } from "./types";

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function applyFilters(
  applications: CandidateApplication[],
  filters: FilterState,
  sortKey: SortKey,
  sortDirection: "asc" | "desc"
): CandidateApplication[] {
  const query = filters.query.trim().toLowerCase();

  const filtered = applications.filter((application) => {
    const text = [
      application.candidateName,
      application.email,
      application.phone,
      application.primarySkill,
      application.location,
      application.role,
      application.source,
      application.summary,
      application.matchedSkills.join(" "),
      application.tags.join(" ")
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!query || text.includes(query)) &&
      (!filters.skill || application.primarySkillKey === filters.skill) &&
      (!filters.location || application.location === filters.location) &&
      (!filters.status || application.status === filters.status)
    );
  });

  return filtered.sort((a, b) => {
    const direction = sortDirection === "asc" ? 1 : -1;
    const left = sortableValue(a, sortKey);
    const right = sortableValue(b, sortKey);

    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * direction;
    }

    return String(left).localeCompare(String(right)) * direction;
  });
}

export function getUniqueLocations(applications: CandidateApplication[]): string[] {
  return Array.from(new Set(applications.map((application) => application.location).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function createTagList(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function sortableValue(application: CandidateApplication, sortKey: SortKey): string | number {
  if (sortKey === "uploadedAt") {
    return Date.parse(application.uploadedAt);
  }

  if (sortKey === "skillScorePercent") {
    return application.skillScorePercent;
  }

  if (sortKey === "lastActivityAt") {
    return Date.parse(application.updatedAt || application.uploadedAt);
  }

  return (application as unknown as Record<string, string | number>)[sortKey] ?? "";
}

