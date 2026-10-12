import type { CommunityDb } from "./community-policy";
import { repositoryWriteWhere } from "./repositories";
import { repoError } from "./repository-input";
export async function pullHeads(
  db: CommunityDb,
  pr: {
    repository_id: string;
    source_branch: string;
    target_branch: string;
    status: string;
    source_head: string;
    target_head: string;
  },
) {
  if (["closed", "merged"].includes(pr.status))
    return { source: pr.source_head, target: pr.target_head };
  const rows = (
    await db.query(
      "SELECT name,head FROM repository_branches WHERE repository_id=$1 AND name=ANY($2::text[])",
      [pr.repository_id, [pr.source_branch, pr.target_branch]],
    )
  ).rows;
  const source = rows.find((b) => b.name === pr.source_branch)?.head,
    target = rows.find((b) => b.name === pr.target_branch)?.head;
  if (!source || !target)
    throw repoError("A pull request branch is unavailable.", 409);
  return { source: source as string, target: target as string };
}
export async function eligibleReviews(
  db: CommunityDb,
  prId: string,
  repoId: string,
  source: string,
  target: string,
) {
  const r = await db.query(
    `SELECT latest.id,latest.reviewer_id,latest.decision FROM (SELECT DISTINCT ON(reviewer_id) id,reviewer_id,decision,source_head,target_head FROM repository_pull_reviews WHERE pull_request_id=$1 ORDER BY reviewer_id,created_at DESC,id DESC) latest JOIN users u ON u.id=latest.reviewer_id AND u.status='active' JOIN repositories repo ON repo.id=$2 JOIN community_projects p ON p.id=repo.project_id WHERE latest.source_head=$3 AND latest.target_head=$4 AND ${repositoryWriteWhere("latest.reviewer_id")}`,
    [prId, repoId, source, target],
  );
  return {
    reviewIds: r.rows.map((r) => r.id as string),
    approvals: r.rows.filter((r) => r.decision === "approved").length,
    changesRequested: r.rows.some((r) => r.decision === "changes-requested"),
  };
}
export async function checkStatus(
  db: CommunityDb,
  id: string,
  source: string,
  target: string,
) {
  return (
    (
      await db.query(
        `SELECT status,details,created_at::text AS "createdAt" FROM repository_pull_checks WHERE pull_request_id=$1 AND source_head=$2 AND target_head=$3`,
        [id, source, target],
      )
    ).rows[0] ?? {
      status: "pending",
      details: "Run the built-in patch check for these commits.",
      createdAt: "",
    }
  );
}
