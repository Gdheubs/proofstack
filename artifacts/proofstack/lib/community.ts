export const csv = (s: string) =>
  Array.from(
    new Set(
      s
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  );

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

export function ago(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Asset paths are stored as returned by the upload API; absolute or rooted paths are used as-is. */
export const assetUrl = (p: string) => p;

export const errStatus = (e: unknown) =>
  (e as { status?: number } | null)?.status;

export const ENTRY_KINDS = {
  personal: [
    "experience",
    "repository",
    "contribution",
    "achievement",
    "challenge",
    "evidence",
  ],
  project: ["release", "documentation", "evidence", "repository"],
  organization: ["repository"],
} as const;

export const KIND_LABEL: Record<string, string> = {
  experience: "Experience",
  repository: "Repositories",
  contribution: "Contributions",
  achievement: "Achievements",
  challenge: "Challenges",
  evidence: "Engineering evidence",
  release: "Releases",
  documentation: "Documentation",
};
export const KIND_HINT: Record<string, string> = {
  challenge:
    "A participation record you maintain. ProofStack does not run or judge challenges.",
  repository: "A manual link. ProofStack does not sync with GitHub.",
  contribution:
    "A manual link to work you contributed. It is not auto-verified.",
};
export const roleLabel = (r: string | null | undefined) =>
  (r ?? "").replace("organization_", "");
