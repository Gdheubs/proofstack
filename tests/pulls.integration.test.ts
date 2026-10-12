import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, it, expect, vi } from "vitest";
import { pool } from "@workspace/db";
import {
  runRepositoryAction,
  getRepositories,
} from "../artifacts/api-server/src/services/repositories";
import { runPullAction } from "../artifacts/api-server/src/services/pull-actions";
import { getPulls } from "../artifacts/api-server/src/services/pull-query";
import {
  git,
  repoPath,
} from "../artifacts/api-server/src/services/repository-git";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
const session = (id: string) =>
  ({
    user: { id },
    aal: "aal2",
    row: { last_mfa_at: new Date() },
    providerUser: { factors: [{ status: "verified", factor_type: "totp" }] },
  }) as AuthSession;
const req = { id: randomUUID() } as Parameters<typeof runPullAction>[0];
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Reviewed merges and immutable releases",
  () => {
    afterAll(async () => {
      await pool.end();
    });
    it("binds reviews/checks to both heads, blocks conflicts and bypasses, and tags a reviewed release", async () => {
      const root = await mkdtemp(join(tmpdir(), "proofstack-pulls-"));
      vi.stubEnv("REPOSITORY_ROOT", root);
      const [owner, author, reviewer, outsider] = Array.from(
          { length: 4 },
          () => randomUUID(),
        ),
        project = randomUUID(),
        issue = randomUUID();
      const repoAct = (uid: string, d: unknown) =>
          runRepositoryAction(req, session(uid), d),
        act = (uid: string, d: unknown) => runPullAction(req, session(uid), d);
      try {
        await pool.query(
          `INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) ids(id)`,
          [[owner, author, reviewer, outsider]],
        );
        await pool.query(
          `INSERT INTO profiles(user_id,display_name,handle) SELECT id,'TEST reviewer','test_'||replace(id::text,'-','') FROM unnest($1::uuid[]) ids(id)`,
          [[owner, author, reviewer, outsider]],
        );
        await pool.query(
          `INSERT INTO community_projects(id,owner_id,slug,title,description) VALUES($1::uuid,$2,$1::text,'TEST reviewed project','Pull fixture')`,
          [project, owner],
        );
        await pool.query(
          `INSERT INTO community_contributors(project_id,user_id,status) SELECT $1,id,'active' FROM unnest($2::uuid[]) ids(id)`,
          [project, [author, reviewer]],
        );
        await pool.query(
          `INSERT INTO project_issues(id,project_id,author_id,title) VALUES($1,$2,$3,'Implement feature')`,
          [issue, project, owner],
        );
        const repositoryId = (
          await repoAct(owner, { action: "create", projectId: project })
        ).id;
        const head = (await getRepositories({ id: repositoryId }, owner)).head;
        await expect(
          repoAct(owner, {
            action: "commit",
            id: repositoryId,
            branch: "main",
            expectedHead: head,
            path: "bypass.txt",
            content: "not reviewed",
            message: "Attempt bypass",
          }),
        ).rejects.toMatchObject({ status: 403 });
        await repoAct(author, {
          action: "branch",
          id: repositoryId,
          branch: "feature",
          from: "main",
          expectedHead: head,
        });
        const edit = async (
          branch: string,
          content: string,
          path = "feature.ts",
        ) => {
          const v = await getRepositories({ id: repositoryId, branch }, author);
          await repoAct(author, {
            action: "commit",
            id: repositoryId,
            branch,
            expectedHead: v.head,
            path,
            content,
            message: "Update feature",
          });
        };
        await edit("feature", "export const value = 1;\n");
        const id = (
          await act(author, {
            action: "open",
            repositoryId,
            title: "Implement feature",
            body: "Adds a tested feature",
            sourceBranch: "feature",
            targetBranch: "main",
            draft: true,
            issueId: issue,
          })
        ).id;
        const snapshot = async (pullId = id) => {
          const d = await getPulls({ id: pullId }, owner);
          return {
            id: pullId,
            sourceHead: d.pull!.sourceHead,
            targetHead: d.pull!.targetHead,
          };
        };
        let snap = await snapshot();
        await expect(
          act(reviewer, {
            action: "review",
            ...snap,
            decision: "approved",
            body: "",
          }),
        ).rejects.toMatchObject({ status: 409 });
        await act(author, { action: "state", id, status: "open" });
        await expect(
          act(author, {
            action: "review",
            ...snap,
            decision: "approved",
            body: "",
          }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          act(outsider, { action: "comment", id, body: "Unauthorized" }),
        ).rejects.toMatchObject({ status: 403 });
        await act(reviewer, {
          action: "review",
          ...snap,
          decision: "approved",
          body: "Reviewed the change",
        });
        await pool.query(
          `UPDATE community_contributors SET status='pending' WHERE project_id=$1 AND user_id=$2`,
          [project, reviewer],
        );
        expect((await getPulls({ id }, owner)).approvalCount).toBe(0);
        await expect(
          act(owner, { action: "merge", ...snap }),
        ).rejects.toMatchObject({ status: 409 });
        await pool.query(
          `UPDATE community_contributors SET status='active' WHERE project_id=$1 AND user_id=$2`,
          [project, reviewer],
        );
        await edit("feature", "export const value = 2;  \n");
        await expect(
          act(owner, { action: "merge", ...snap }),
        ).rejects.toMatchObject({ status: 409 });
        snap = await snapshot();
        expect((await getPulls({ id }, owner)).approvalCount).toBe(0);
        await act(author, { action: "check", ...snap });
        expect((await getPulls({ id }, owner)).check.status).toBe("failed");
        await act(reviewer, {
          action: "review",
          ...snap,
          decision: "approved",
          body: "Review recorded but check remains blocking",
        });
        await expect(
          act(owner, { action: "merge", ...snap }),
        ).rejects.toMatchObject({ status: 409 });
        await edit("feature", "export const value = 2;\n");
        snap = await snapshot();
        await act(author, { action: "check", ...snap });
        await act(reviewer, {
          action: "review",
          ...snap,
          decision: "changes-requested",
          body: "Please confirm coverage",
        });
        expect((await getPulls({ id }, owner)).changesRequested).toBe(true);
        await act(reviewer, {
          action: "review",
          ...snap,
          decision: "approved",
          body: "Coverage confirmed",
        });
        const stale = session(owner);
        stale.row.last_mfa_at = new Date(0);
        await expect(
          runPullAction(req, stale, { action: "merge", ...snap }),
        ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
        await act(owner, { action: "merge", ...snap });
        const merged = await getPulls({ id }, owner);
        expect(merged.pull!.status).toBe("merged");
        const mergeHead = merged.pull!.mergeHead!;
        expect(
          (
            await pool.query("SELECT status FROM project_issues WHERE id=$1", [
              issue,
            ])
          ).rows[0].status,
        ).toBe("done");
        await expect(
          act(author, { action: "state", id, status: "open" }),
        ).rejects.toMatchObject({ status: 409 });
        await act(owner, {
          action: "release",
          repositoryId,
          commit: mergeHead,
          tag: "v1.0.0",
          title: "First reviewed release",
          notes: "Introduces the feature",
        });
        await getRepositories({ id: repositoryId }, owner);
        const disk = await repoPath(repositoryId);
        expect(
          (await git(disk, ["rev-parse", "refs/tags/v1.0.0"]))
            .toString()
            .trim(),
        ).toBe(mergeHead);
        expect(
          (await getPulls({ repositoryId, view: "releases" }, null)).releases[0]
            .commit,
        ).toBe(mergeHead);
        await expect(
          act(owner, {
            action: "release",
            repositoryId,
            commit: mergeHead,
            tag: "v1.0.0",
            title: "Cannot rewrite",
            notes: "",
          }),
        ).rejects.toMatchObject({ code: "23505" });
        await edit("feature", "export const value = 3;\n");
        const unpublished = (
          await getRepositories({ id: repositoryId, branch: "feature" }, owner)
        ).head;
        await expect(
          act(owner, {
            action: "release",
            repositoryId,
            commit: unpublished,
            tag: "v1.0.1",
            title: "Unmerged release",
            notes: "",
          }),
        ).rejects.toMatchObject({ status: 409 });
        // Both PRs originate at the same default head and edit the same line.
        const conflictIds: string[] = [];
        for (const [branch, content] of [
          ["left", "Left version\n"],
          ["right", "Right version\n"],
        ]) {
          await repoAct(author, {
            action: "branch",
            id: repositoryId,
            branch,
            from: "main",
            expectedHead: mergeHead,
          });
          await edit(branch, content, "README.md");
          const pullId = (
            await act(author, {
              action: "open",
              repositoryId,
              title: branch + " proposal",
              body: "Conflict fixture",
              sourceBranch: branch,
              targetBranch: "main",
              draft: false,
              issueId: null,
            })
          ).id;
          conflictIds.push(pullId);
          await act(reviewer, {
            action: "review",
            ...(await snapshot(pullId)),
            decision: "approved",
            body: "Review current snapshot",
          });
        }
        await act(owner, {
          action: "merge",
          ...(await snapshot(conflictIds[0])),
        });
        expect(
          (await getPulls({ id: conflictIds[1] }, owner)).approvalCount,
        ).toBe(0);
        const conflictSnap = await snapshot(conflictIds[1]);
        await act(author, { action: "check", ...conflictSnap });
        await act(reviewer, {
          action: "review",
          ...conflictSnap,
          decision: "approved",
          body: "Review after target update",
        });
        const before = (await getRepositories({ id: repositoryId }, owner))
          .head;
        await expect(
          act(owner, { action: "merge", ...conflictSnap }),
        ).rejects.toMatchObject({
          status: 409,
          message: expect.stringContaining("conflict"),
        });
        expect((await getRepositories({ id: repositoryId }, owner)).head).toBe(
          before,
        );
        await pool.query(
          `UPDATE community_projects SET visibility='private' WHERE id=$1`,
          [project],
        );
        await expect(getPulls({ id }, outsider)).rejects.toMatchObject({
          status: 404,
        });
        await expect(
          getPulls({ repositoryId, view: "releases" }, null),
        ).rejects.toMatchObject({ status: 404 });
      } finally {
        await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
          [owner, author, reviewer, outsider],
        ]);
        await rm(root, { recursive: true, force: true });
        vi.unstubAllEnvs();
      }
    });
  },
);
