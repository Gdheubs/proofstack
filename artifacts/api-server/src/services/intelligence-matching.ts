import type { IntelligenceOutput, IntelligenceMatch } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { intelligenceError } from "./intelligence-input";
import type { CommunityDb } from "./community-policy";
export const emptyOutput = (
  engine: string,
  disclaimer: string,
): IntelligenceOutput => ({
  summary: "",
  matches: [],
  steps: [],
  findings: [],
  scannedFiles: 0,
  skippedFiles: 0,
  truncated: false,
  engine,
  disclaimer,
});
export const normalizeSkill = (s: string) =>
  s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export type Opportunity = {
  id: string;
  title: string;
  organization: string;
  skills: string[];
  kind: string;
  workplace: string;
};
export async function publicOpportunities(
  ids?: string[],
  db: CommunityDb = pool,
): Promise<Opportunity[]> {
  return (
    await db.query(
      `SELECT j.id,j.title,o.name AS organization,j.skills,j.kind,j.workplace FROM career_jobs j JOIN organizations o ON o.id=j.organization_id JOIN community_organization_profiles op ON op.organization_id=o.id AND op.visibility='public' JOIN users u ON u.id=j.creator_id AND u.status='active' WHERE j.status='open' AND ($1::uuid[] IS NULL OR j.id=ANY($1::uuid[])) ORDER BY j.created_at DESC,j.id DESC LIMIT 501`,
      [ids ?? null],
    )
  ).rows;
}
export async function ownSkills(
  uid: string,
  db: CommunityDb = pool,
): Promise<string[]> {
  const row = (
    await db.query(
      "SELECT p.skills FROM profiles p JOIN users u ON u.id=p.user_id AND u.status='active' WHERE p.user_id=$1",
      [uid],
    )
  ).rows[0];
  if (!row)
    throw intelligenceError(
      "An active account with a profile is required.",
      403,
    );
  return row.skills.slice(0, 30);
}
export function matchOpportunities(
  skills: string[],
  jobs: Opportunity[],
  workplace: string,
): IntelligenceMatch[] {
  const known = new Set(skills.map(normalizeSkill));
  return jobs
    .filter((j) => workplace === "any" || j.workplace === workplace)
    .map((j) => {
      const unique = [
        ...new Map(j.skills.map((s) => [normalizeSkill(s), s])).values(),
      ];
      return {
        id: j.id,
        title: j.title,
        organization: j.organization,
        kind: j.kind,
        workplace: j.workplace,
        matchedSkills: unique.filter((s) => known.has(normalizeSkill(s))),
        otherSkills: unique.filter((s) => !known.has(normalizeSkill(s))),
      };
    })
    .filter((j) => j.matchedSkills.length > 0)
    .sort(
      (a, b) =>
        b.matchedSkills.length - a.matchedSkills.length ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 20);
}
export async function opportunityOutput(
  uid: string,
  workplace: string,
): Promise<IntelligenceOutput> {
  const skills = await ownSkills(uid),
    jobs = await publicOpportunities();
  const result = emptyOutput(
    "skill-overlap-v1",
    "Suggestions use exact normalized overlap with your self-reported skills. They do not assess competence, eligibility, or hiring suitability. No applications are submitted automatically.",
  );
  result.matches = matchOpportunities(skills, jobs.slice(0, 500), workplace);
  result.truncated = jobs.length > 500;
  result.summary = skills.length
    ? `Compared the newest ${Math.min(jobs.length, 500)} public open opportunities. ${result.matches.length} suggestions share at least one of your skills.`
    : "Add skills to your developer profile, then request suggestions again.";
  return result;
}
