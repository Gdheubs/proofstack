import { execFile } from "node:child_process";
import { promisify } from "node:util";
import app from "../artifacts/api-server/src/app";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, it, expect, vi } from "vitest";
import { pool } from "@workspace/db";
import {
  getRepositories,
  runRepositoryAction,
  tokenUser,
} from "../artifacts/api-server/src/services/repositories";
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
const req = { id: randomUUID() } as Parameters<typeof runRepositoryAction>[0];
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Repository authorization, concurrency and recovery",
  () => {
    afterAll(async () => {
      await pool.end();
    });
    it("protects main, rejects stale edits, restores refs and checks token revocation, recovery lockdown, disabled users and project privacy", async () => {
      const folder = await mkdtemp(join(tmpdir(), "proofstack-repo-db-"));
      vi.stubEnv("REPOSITORY_ROOT", folder);
      vi.stubEnv(
        "SESSION_SECRET",
        "test-only-repository-secret-at-least-32-characters",
      );
      const [owner, contributor, outsider] = Array.from({ length: 3 }, () =>
        randomUUID(),
      );
      const project = randomUUID();
      const act = (uid: string, data: unknown) =>
        runRepositoryAction(req, session(uid), data);
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing test address");
      const run = promisify(execFile);
      const clone = async (id: string, target: string, token?: string) =>
        run(
          "git",
          [
            "clone",
            `http://127.0.0.1:${address.port}/api/git/${id}`,
            join(folder, target),
          ],
          {
            timeout: 10000,
            maxBuffer: 1024 * 1024,
            env: {
              ...process.env,
              HOME: folder,
              GIT_TERMINAL_PROMPT: "0",
              GIT_CONFIG_NOSYSTEM: "1",
              GIT_CONFIG_GLOBAL: "/dev/null",
              ...(token
                ? {
                    GIT_CONFIG_COUNT: "1",
                    GIT_CONFIG_KEY_0: "http.extraHeader",
                    GIT_CONFIG_VALUE_0:
                      "Authorization: Basic " +
                      Buffer.from("git:" + token).toString("base64"),
                  }
                : {}),
            },
          },
        );
      try {
        await pool.query(
          `INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) ids(id)`,
          [[owner, contributor, outsider]],
        );
        await pool.query(
          `INSERT INTO profiles(user_id,display_name,handle) SELECT id,'TEST Git builder','test_'||replace(id::text,'-','') FROM unnest($1::uuid[]) ids(id)`,
          [[owner, contributor, outsider]],
        );
        await pool.query(
          `INSERT INTO community_projects(id,owner_id,slug,title,description) VALUES($1::uuid,$2,$1::text,'TEST native repository','Git fixture')`,
          [project, owner],
        );
        await pool.query(
          `INSERT INTO community_contributors(project_id,user_id,status) VALUES($1,$2,'active')`,
          [project, contributor],
        );
        await expect(
          act(outsider, { action: "create", projectId: project }),
        ).rejects.toMatchObject({ status: 403 });
        const id = (await act(owner, { action: "create", projectId: project }))
          .id;
        await expect(
          act(owner, { action: "create", projectId: project }),
        ).rejects.toMatchObject({ status: 409 });
        let view = await getRepositories({ id }, null);
        const head = view.head;
        await clone(id, "public-clone");
        expect(
          await readFile(join(folder, "public-clone", "README.md"), "utf8"),
        ).toContain("Build something");
        expect(view.entries[0].name).toBe("README.md");
        expect(view.repositories[0].canWrite).toBeFalsy();
        const edit = {
          action: "commit",
          id,
          branch: "main",
          expectedHead: head,
          path: "src/app.ts",
          content: "export const value=1;\n",
          message: "Add source",
        };
        await expect(act(contributor, edit)).rejects.toMatchObject({
          status: 403,
        });
        await expect(act(outsider, edit)).rejects.toMatchObject({
          status: 403,
        });
        await act(contributor, {
          action: "branch",
          id,
          from: "main",
          branch: "feature/source",
          expectedHead: head,
        });
        await act(contributor, { ...edit, branch: "feature/source" });
        await expect(
          act(contributor, {
            ...edit,
            branch: "feature/source",
            content: "overwrite",
          }),
        ).rejects.toMatchObject({ status: 409 });
        view = await getRepositories(
          { id, branch: "feature/source", path: "src/app.ts" },
          owner,
        );
        expect(view.file?.content).toContain("value=1");
        await run(
          "git",
          ["-C", join(folder, "public-clone"), "fetch", "origin"],
          { timeout: 10000 },
        );
        const fetched = await run("git", [
          "-C",
          join(folder, "public-clone"),
          "show",
          "origin/feature/source:src/app.ts",
        ]);
        expect(fetched.stdout).toContain("value=1");
        const historical = await getRepositories(
          { id, branch: "feature/source", revision: head },
          owner,
        );
        expect(historical.entries.some((e) => e.name === "src")).toBe(false);
        await expect(
          getRepositories({ id, revision: "f".repeat(40) }, owner),
        ).rejects.toMatchObject({ status: 404 });
        const pushAdvertisement = await fetch(
          `http://127.0.0.1:${address.port}/api/git/${id}/info/refs?service=git-receive-pack`,
        );
        expect(pushAdvertisement.status).toBe(403);
        expect(view.commits).toHaveLength(2);
        // Simulate a filesystem ref lag after a successful DB commit.
        const path = await repoPath(id);
        await git(path, ["update-ref", "refs/heads/feature/source", head]);
        await getRepositories({ id, branch: "feature/source" }, owner);
        expect(
          (await git(path, ["rev-parse", "refs/heads/feature/source"]))
            .toString()
            .trim(),
        ).toBe(view.head);
        const token = (
          await act(owner, { action: "token-create", id, name: "TEST clone" })
        ).token!;
        expect(await tokenUser("Bearer " + token, id)).toBe(owner);
        const rows = await pool.query(
          "SELECT token_hash FROM repository_tokens WHERE repository_id=$1",
          [id],
        );
        expect(rows.rows[0].token_hash).not.toContain(token);
        await pool.query(
          `UPDATE community_projects SET visibility='private' WHERE id=$1`,
          [project],
        );
        await expect(getRepositories({ id }, null)).rejects.toMatchObject({
          status: 404,
        });
        await expect(
          getRepositories({ id }, contributor),
        ).rejects.toMatchObject({ status: 404 });
        await expect(clone(id, "anonymous-private")).rejects.toBeDefined();
        await clone(id, "private-clone", token);
        expect(
          await readFile(join(folder, "private-clone", "README.md"), "utf8"),
        ).toContain("Build something");
        // Existing, unexpired credentials must follow the current account state.
        const basic = "Basic " + Buffer.from("git:" + token).toString("base64");
        const credentialState = async () =>
          (
            await pool.query(
              `SELECT u.status,u.mfa_recovery_required,t.revoked_at IS NULL AS unrevoked,t.expires_at>now() AS unexpired FROM repository_tokens t JOIN users u ON u.id=t.user_id WHERE t.repository_id=$1 AND t.user_id=$2`,
              [id, owner],
            )
          ).rows[0];
        await pool.query(
          "UPDATE users SET mfa_recovery_required=true WHERE id=$1",
          [owner],
        );
        expect(await credentialState()).toMatchObject({
          status: "active",
          mfa_recovery_required: true,
          unrevoked: true,
          unexpired: true,
        });
        await expect(tokenUser("Bearer " + token, id)).rejects.toMatchObject({
          status: 401,
        });
        await expect(tokenUser(basic, id)).rejects.toMatchObject({
          status: 401,
        });
        const recoveryAdvertisement = await fetch(
          `http://127.0.0.1:${address.port}/api/git/${id}/info/refs?service=git-upload-pack`,
          { headers: { Authorization: basic } },
        );
        expect(recoveryAdvertisement.status).toBe(401);
        await expect(clone(id, "recovery-clone", token)).rejects.toBeDefined();

        // Recovery suspends access; clearing it does not silently revoke tokens.
        await pool.query(
          "UPDATE users SET mfa_recovery_required=false WHERE id=$1",
          [owner],
        );
        expect(await tokenUser("Bearer " + token, id)).toBe(owner);
        expect(await tokenUser(basic, id)).toBe(owner);
        await clone(id, "recovered-clone", token);
        expect(
          await readFile(join(folder, "recovered-clone", "README.md"), "utf8"),
        ).toContain("Build something");

        // Clearing recovery must not bypass the existing disabled-user policy.
        await pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
          owner,
        ]);
        expect(await credentialState()).toMatchObject({
          status: "disabled",
          mfa_recovery_required: false,
          unrevoked: true,
          unexpired: true,
        });
        await expect(tokenUser("Bearer " + token, id)).rejects.toMatchObject({
          status: 401,
        });
        await expect(tokenUser(basic, id)).rejects.toMatchObject({
          status: 401,
        });
        await expect(clone(id, "disabled-clone", token)).rejects.toBeDefined();
        await pool.query("UPDATE users SET status='active' WHERE id=$1", [
          owner,
        ]);
        expect(await tokenUser("Bearer " + token, id)).toBe(owner);
        const owned = await getRepositories({ id }, owner);
        await act(owner, {
          action: "token-revoke",
          id,
          tokenId: owned.tokens[0].id,
        });
        await expect(tokenUser("Bearer " + token, id)).rejects.toMatchObject({
          status: 401,
        });
        await expect(clone(id, "revoked-clone", token)).rejects.toBeDefined();
        const stale = session(owner);
        stale.row.last_mfa_at = new Date(0);
        await expect(
          runRepositoryAction(req, stale, {
            action: "token-create",
            id,
            name: "Stale",
          }),
        ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
        expect(
          (
            await pool.query(
              `SELECT count(*)::int AS n FROM audit_logs WHERE actor_user_id=ANY($1::uuid[]) AND action LIKE 'repository.%'`,
              [[owner, contributor]],
            )
          ).rows[0].n,
        ).toBe(5);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve())),
        );
        await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
          [owner, contributor, outsider],
        ]);
        await rm(folder, { recursive: true, force: true });
        vi.unstubAllEnvs();
      }
    });
  },
);
