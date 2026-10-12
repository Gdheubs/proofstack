import type { PullRow } from "./pull-query";
import type { Request } from "express";
import {
  transaction,
  audit,
  requireFresh,
  type AuthSession,
} from "./auth-sessions";
import {
  authorizeProject,
  requireCommunityProfile,
  missing,
  denied,
  notify,
} from "./community-policy";
import { repositoryAccess } from "./repositories";
import { pullInput } from "./pull-input";
import { repoError } from "./repository-input";
import { repoPath, git, quota, GitCommandError } from "./repository-git";
import { pullHeads, eligibleReviews, checkStatus } from "./pull-policy";
import { patchCheck, mergeCommit } from "./pull-git";
export async function runPullAction(
  req: Request,
  s: AuthSession,
  raw: unknown,
) {
  const d = pullInput(raw),
    uid = s.user.id;
  return transaction(async (db) => {
    await requireCommunityProfile(uid, db);
    let pr: PullRow | undefined;
    if ("id" in d) {
      pr = (
        await db.query("SELECT * FROM repository_pull_requests WHERE id=$1", [
          d.id,
        ])
      ).rows[0];
      if (!pr) throw missing();
    }
    const repoId = "repositoryId" in d ? d.repositoryId : pr!.repository_id;
    const initial = await repositoryAccess(repoId, uid, db);
    await authorizeProject(
      db,
      s,
      initial.projectId,
      ["merge", "release"].includes(d.action) ? "edit" : "contribute",
    );
    const repo = await repositoryAccess(repoId, uid, db, true);
    if (pr)
      pr = (
        await db.query(
          "SELECT * FROM repository_pull_requests WHERE id=$1 FOR UPDATE",
          [pr.id],
        )
      ).rows[0];
    let id = pr?.id ?? repoId;
    if (d.action === "release") {
      requireFresh(s, true);
      const path = await repoPath(repoId);
      const target = (
        await db.query(
          "SELECT head FROM repository_branches WHERE repository_id=$1 AND name=$2",
          [repoId, repo.defaultBranch],
        )
      ).rows[0]?.head;
      if (!target) throw missing();
      try {
        await git(path, ["merge-base", "--is-ancestor", d.commit, target]);
      } catch (e) {
        if (e instanceof GitCommandError)
          throw repoError(
            "Release commits must be reachable from the default branch.",
            409,
          );
        throw e;
      }
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM repository_releases WHERE repository_id=$1",
          [repoId],
        )
      ).rows[0].n;
      if (count >= 100) throw repoError("Release limit reached (100).", 409);
      id = (
        await db.query(
          `INSERT INTO repository_releases(repository_id,author_id,tag,title,notes,"commit") VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [repoId, uid, d.tag, d.title, d.notes, d.commit],
        )
      ).rows[0].id;
    } else if (d.action === "open") {
      if (d.sourceBranch === d.targetBranch)
        throw repoError("Choose different source and target branches.");
      if (d.issueId) {
        const issue = await db.query(
          "SELECT 1 FROM project_issues WHERE id=$1 AND project_id=$2",
          [d.issueId, repo.projectId],
        );
        if (!issue.rows.length)
          throw repoError("Select a task from this project.");
      }
      const duplicate = await db.query(
        `SELECT 1 FROM repository_pull_requests WHERE repository_id=$1 AND source_branch=$2 AND target_branch=$3 AND status IN ('draft','open')`,
        [repoId, d.sourceBranch, d.targetBranch],
      );
      if (duplicate.rows.length)
        throw repoError(
          "An active pull request already covers these branches.",
          409,
        );
      const branches = (
        await db.query(
          "SELECT name,head FROM repository_branches WHERE repository_id=$1",
          [repoId],
        )
      ).rows;
      const source = branches.find((b) => b.name === d.sourceBranch)?.head,
        target = branches.find((b) => b.name === d.targetBranch)?.head;
      if (!source || !target) throw repoError("Select existing branches.");
      const path = await repoPath(repoId);
      const count = Number(
        (
          await git(path, ["rev-list", "--count", `${target}..${source}`])
        ).toString(),
      );
      if (!count)
        throw repoError(
          "The source branch has no new commits for this target.",
          409,
        );
      const number = (
        await db.query(
          "SELECT coalesce(max(number),0)+1 AS n FROM repository_pull_requests WHERE repository_id=$1",
          [repoId],
        )
      ).rows[0].n;
      if (number > 10000) throw repoError("Pull request limit reached.", 409);
      id = (
        await db.query(
          `INSERT INTO repository_pull_requests(repository_id,number,author_id,title,body,source_branch,target_branch,status,issue_id,source_head,target_head) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            repoId,
            number,
            uid,
            d.title,
            d.body,
            d.sourceBranch,
            d.targetBranch,
            d.draft ? "draft" : "open",
            d.issueId,
            source,
            target,
          ],
        )
      ).rows[0].id;
      const check = await patchCheck(path, target, source);
      await db.query(
        "INSERT INTO repository_pull_checks(pull_request_id,source_head,target_head,status,details) VALUES($1,$2,$3,$4,$5)",
        [id, source, target, check.status, check.details],
      );
    } else {
      if (!pr) throw missing();
      const heads = await pullHeads(db, pr);
      if (d.action === "state") {
        if (pr.status === "merged")
          throw repoError("Merged pull requests cannot be reopened.", 409);
        if (pr.author_id !== uid && !repo.canManage) throw denied();
        if (d.status === pr.status)
          throw repoError("This pull request already has that status.", 409);
        if (d.status === "open") {
          const duplicate = await db.query(
            `SELECT 1 FROM repository_pull_requests WHERE repository_id=$1 AND source_branch=$2 AND target_branch=$3 AND status IN ('draft','open') AND id<>$4`,
            [repoId, pr.source_branch, pr.target_branch, pr.id],
          );
          if (duplicate.rows.length)
            throw repoError(
              "Another active pull request covers these branches.",
              409,
            );
        }
        await db.query(
          "UPDATE repository_pull_requests SET status=$2,source_head=$3,target_head=$4,updated_at=now() WHERE id=$1",
          [id, d.status, heads.source, heads.target],
        );
      } else if (d.action === "comment") {
        const count = (
          await db.query(
            "SELECT count(*)::int AS n FROM repository_pull_comments WHERE pull_request_id=$1",
            [id],
          )
        ).rows[0].n;
        if (count >= 500)
          throw repoError("Discussion limit reached (500 comments).", 409);
        await db.query(
          "INSERT INTO repository_pull_comments(pull_request_id,author_id,body) VALUES($1,$2,$3)",
          [id, uid, d.body],
        );
      } else {
        if (pr.status !== "open")
          throw repoError(
            "Mark this pull request ready before reviewing, checking or merging.",
            409,
          );
        if (d.sourceHead !== heads.source || d.targetHead !== heads.target)
          throw repoError(
            "A branch changed. Reload and review the latest commits.",
            409,
          );
        if (d.action === "review") {
          if (pr.author_id === uid)
            throw repoError(
              "The author cannot approve or formally review their own pull request.",
              403,
            );
          const count = (
            await db.query(
              "SELECT count(*)::int AS n FROM repository_pull_reviews WHERE pull_request_id=$1",
              [id],
            )
          ).rows[0].n;
          if (count >= 500) throw repoError("Review limit reached (500).", 409);
          await db.query(
            "INSERT INTO repository_pull_reviews(pull_request_id,reviewer_id,source_head,target_head,decision,body,created_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())",
            [id, uid, heads.source, heads.target, d.decision, d.body],
          );
        } else if (d.action === "check") {
          const check = await patchCheck(
            await repoPath(repoId),
            heads.target,
            heads.source,
          );
          await db.query(
            `INSERT INTO repository_pull_checks(pull_request_id,source_head,target_head,status,details) VALUES($1,$2,$3,$4,$5) ON CONFLICT(pull_request_id,source_head,target_head) DO UPDATE SET status=excluded.status,details=excluded.details,created_at=now()`,
            [id, heads.source, heads.target, check.status, check.details],
          );
        } else {
          requireFresh(s, true);
          const reviews = await eligibleReviews(
            db,
            id,
            repoId,
            heads.source,
            heads.target,
          );
          if (reviews.approvals < 1 || reviews.changesRequested)
            throw repoError(
              "Merge requires a current approval and no current changes-requested reviews.",
              409,
            );
          if (
            (await checkStatus(db, id, heads.source, heads.target)).status !==
            "passed"
          )
            throw repoError(
              "The current patch check must pass before merging.",
              409,
            );
          const path = await repoPath(repoId);
          await quota(path, repo.quotaBytes);
          const commits = Number(
            (
              await git(path, [
                "rev-list",
                "--count",
                `${heads.target}..${heads.source}`,
              ])
            ).toString(),
          );
          if (!commits)
            throw repoError(
              "These commits are already in the target branch.",
              409,
            );
          const merged = await mergeCommit(
            path,
            heads.target,
            heads.source,
            `Merge pull request #${pr.number}: ${pr.title}`,
            uid,
          );
          await quota(path, repo.quotaBytes);
          await db.query(
            "UPDATE repository_branches SET head=$3,updated_at=now() WHERE repository_id=$1 AND name=$2",
            [repoId, pr.target_branch, merged],
          );
          await db.query(
            `UPDATE repository_pull_requests SET status='merged',source_head=$2,target_head=$3,merge_head=$4,updated_at=now() WHERE id=$1`,
            [id, heads.source, heads.target, merged],
          );
          if (pr.issue_id && pr.target_branch === repo.defaultBranch)
            await db.query(
              `UPDATE project_issues SET status='done',updated_at=now() WHERE id=$1 AND project_id=$2`,
              [pr.issue_id, repo.projectId],
            );
        }
      }
      if (pr.author_id)
        await notify(
          db,
          pr.author_id,
          uid,
          "Pull request updated",
          `${pr.title}: ${d.action}`,
          `/pulls/${id}`,
        );
    }
    await audit(req, "pull." + d.action, uid, id, {}, db);
    return {
      id,
      repositoryId: repoId,
      message:
        d.action === "merge"
          ? "Pull request merged"
          : d.action === "release"
            ? "Immutable release published"
            : "Saved successfully",
    };
  });
}
