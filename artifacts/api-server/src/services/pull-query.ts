import { pool } from "@workspace/db";
import type { PullData, PullRequest } from "@workspace/api-zod";
import { lockedRepository, type RepositoryRow } from "./repositories";
import { pullQuery } from "./pull-input";
import { repoError } from "./repository-input";
import { missing } from "./community-policy";
import { pullHeads, eligibleReviews, checkStatus } from "./pull-policy";
import { pullDiff } from "./pull-git";
export type PullRow = {
  id: string;
  repository_id: string;
  number: number;
  author_id: string | null;
  author_name?: string;
  title: string;
  body: string;
  source_branch: string;
  target_branch: string;
  status: string;
  issue_id: string | null;
  source_head: string;
  target_head: string;
  merge_head: string | null;
  created_at: Date;
  updated_at: Date;
};
function summary(
  p: PullRow,
  repo: RepositoryRow,
  uid: string | null,
): PullRequest {
  return {
    id: p.id,
    repositoryId: p.repository_id,
    number: p.number,
    title: p.title,
    body: p.body,
    authorId: p.author_id,
    authorName: p.author_name ?? "Deleted account",
    status: p.status,
    sourceBranch: p.source_branch,
    targetBranch: p.target_branch,
    sourceHead: p.source_head,
    targetHead: p.target_head,
    mergeHead: p.merge_head,
    issueId: p.issue_id,
    createdAt: new Date(p.created_at).toISOString(),
    updatedAt: new Date(p.updated_at).toISOString(),
    canManage: repo.canManage,
    isAuthor: !!uid && p.author_id === uid,
    canReview: repo.canWrite && p.author_id !== uid && p.status === "open",
  };
}
export async function getPulls(
  raw: unknown,
  uid: string | null,
): Promise<PullData> {
  const parsed = pullQuery.safeParse(raw);
  if (!parsed.success) throw repoError("Invalid collaboration query.");
  const d = parsed.data;
  const repositoryId = d.id
    ? (
        await pool.query(
          "SELECT repository_id FROM repository_pull_requests WHERE id=$1",
          [d.id],
        )
      ).rows[0]?.repository_id
    : d.repositoryId;
  if (!repositoryId) throw missing();
  return lockedRepository(
    repositoryId,
    uid,
    async (repo, path, db, branches) => {
      const out: PullData = {
        repository: {
          id: repo.id,
          title: repo.projectTitle,
          projectId: repo.projectId,
          projectSlug: repo.projectSlug,
          defaultBranch: repo.defaultBranch,
          canWrite: repo.canWrite,
          canManage: repo.canManage,
        },
        branches,
        issues: [],
        pulls: [],
        pull: null,
        reviews: [],
        comments: [],
        check: {
          status: "pending",
          details: "Run the patch check.",
          createdAt: "",
        },
        approvalCount: 0,
        changesRequested: false,
        canMerge: false,
        patch: "",
        patchTruncated: false,
        files: [],
        releases: [],
        hasMore: false,
        offset: d.offset,
      };
      if (d.view === "releases") {
        const rows = (
          await db.query(
            `SELECT r.id,r.tag,r.title,r.notes,r."commit",coalesce(p.display_name,'Deleted account') AS "authorName",r.created_at::text AS "createdAt" FROM repository_releases r LEFT JOIN profiles p ON p.user_id=r.author_id WHERE r.repository_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 21 OFFSET $2`,
            [repo.id, d.offset],
          )
        ).rows;
        out.releases = rows.slice(0, 20);
        out.hasMore = rows.length > 20;
        return out;
      }
      if (!d.id) {
        const rows = (
          await db.query(
            `SELECT pr.*,p.display_name AS author_name FROM repository_pull_requests pr LEFT JOIN profiles p ON p.user_id=pr.author_id WHERE pr.repository_id=$1 AND ($2='all' OR pr.status=$2) ORDER BY pr.created_at DESC,pr.id DESC LIMIT 21 OFFSET $3`,
            [repo.id, d.status, d.offset],
          )
        ).rows;
        out.pulls = rows.slice(0, 20).map((p) => summary(p, repo, uid));
        out.hasMore = rows.length > 20;
        if (repo.canWrite)
          out.issues = (
            await db.query(
              `SELECT id,title,status FROM project_issues WHERE project_id=$1 AND status<>'done' ORDER BY created_at DESC LIMIT 100`,
              [repo.projectId],
            )
          ).rows;
        return out;
      }
      const pr: PullRow | undefined = (
        await db.query(
          "SELECT pr.*,p.display_name AS author_name FROM repository_pull_requests pr LEFT JOIN profiles p ON p.user_id=pr.author_id WHERE pr.id=$1 AND pr.repository_id=$2",
          [d.id, repo.id],
        )
      ).rows[0];
      if (!pr) throw missing();
      const heads = await pullHeads(db, pr);
      out.pull = {
        ...summary(pr, repo, uid),
        sourceHead: heads.source,
        targetHead: heads.target,
      };
      const reviews = await eligibleReviews(
        db,
        pr.id,
        repo.id,
        heads.source,
        heads.target,
      );
      out.approvalCount = reviews.approvals;
      out.changesRequested = reviews.changesRequested;
      out.check = await checkStatus(db, pr.id, heads.source, heads.target);
      out.canMerge =
        repo.canManage &&
        pr.status === "open" &&
        reviews.approvals > 0 &&
        !reviews.changesRequested &&
        out.check.status === "passed";
      out.reviews = (
        await db.query(
          `SELECT r.id,r.reviewer_id AS "reviewerId",p.display_name AS "reviewerName",r.decision,r.body,r.source_head AS "sourceHead",r.target_head AS "targetHead",r.created_at::text AS "createdAt" FROM repository_pull_reviews r JOIN profiles p ON p.user_id=r.reviewer_id WHERE r.pull_request_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 100`,
          [pr.id],
        )
      ).rows.map((r) => ({ ...r, current: reviews.reviewIds.includes(r.id) }));
      out.comments = (
        await db.query(
          `SELECT c.id,coalesce(p.display_name,'Deleted account') AS "authorName",c.body,c.created_at::text AS "createdAt" FROM repository_pull_comments c LEFT JOIN profiles p ON p.user_id=c.author_id WHERE c.pull_request_id=$1 ORDER BY c.created_at DESC,c.id DESC LIMIT 100`,
          [pr.id],
        )
      ).rows.reverse();
      Object.assign(out, await pullDiff(path, heads.target, heads.source));
      return out;
    },
  );
}
