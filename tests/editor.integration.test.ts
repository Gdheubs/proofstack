import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import { pool } from "@workspace/db";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";

const identity = vi.hoisted(() => ({ uid: null as string | null }));
// Only the verified identity boundary is faked; SQL, Git and CSRF are real.
vi.mock(
  "../artifacts/api-server/src/services/auth-sessions",
  async (original) => ({
    ...(await original<
      typeof import("../artifacts/api-server/src/services/auth-sessions")
    >()),
    readSession: async () =>
      identity.uid
        ? ({
            user: { id: identity.uid, platformRole: null },
            mfaRequired: false,
            aal: "aal2",
            row: { last_mfa_at: new Date(), created_at: new Date() },
            providerUser: { factors: [] },
          } as unknown as AuthSession)
        : null,
  }),
);
import app from "../artifacts/api-server/src/app";
import { seal, signedNonce } from "../artifacts/api-server/src/lib/auth-crypto";
import { runRepositoryAction } from "../artifacts/api-server/src/services/repositories";
import {
  commitChanges,
  listRepositories,
  listTree,
  readFile,
} from "../artifacts/api-server/src/services/editor";
import { exportAccount } from "../artifacts/api-server/src/services/account-data";
import { transaction } from "../artifacts/api-server/src/services/auth-sessions";

const origin = "https://editor.example.test";
const sessionOf = (id: string) =>
  ({
    user: { id, platformRole: null },
    aal: "aal2",
    row: { last_mfa_at: new Date(), created_at: new Date() },
    providerUser: { factors: [{ status: "verified", factor_type: "totp" }] },
  }) as unknown as AuthSession;
const req = { id: randomUUID(), get: () => undefined } as never;
const head = (n: number) => String(n).repeat(40).slice(0, 40);

describe.skipIf(process.env.RUN_DB_TESTS !== "1")("Code editor", () => {
  let owner: string, outsider: string;
  beforeEach(async () => {
    vi.stubEnv("SESSION_SECRET", "editor-test-only-secret-at-least-32-chars");
    vi.stubEnv("AUTH_APP_ORIGIN", origin);
    vi.stubEnv("REPOSITORY_ROOT", await mkdtemp(join(tmpdir(), "ps-editor-")));
    owner = randomUUID();
    outsider = randomUUID();
    await pool.query("DELETE FROM rate_limit_buckets");
    await pool.query(
      "INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) ids(id)",
      [[owner, outsider]],
    );
    await pool.query(
      "INSERT INTO profiles(user_id,display_name,handle) SELECT id,'Editor user','e'||left(replace(id::text,'-',''),14) FROM unnest($1::uuid[]) ids(id)",
      [[owner, outsider]],
    );
  });
  afterEach(async () => {
    identity.uid = null;
    vi.unstubAllGlobals();
    await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
      [owner, outsider],
    ]);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await pool.end();
  });

  describe("ProofStack-hosted repositories", () => {
    let repo: string;
    beforeEach(async () => {
      const project = randomUUID();
      await pool.query(
        "INSERT INTO community_projects(id,owner_id,slug,title,description,visibility) VALUES($1,$2,$3,'Editor project','Fixture','private')",
        [project, owner, project],
      );
      repo = (
        await runRepositoryAction(req, sessionOf(owner), {
          action: "create",
          projectId: project,
        })
      ).id;
    });

    it("lists only writable repositories and their files", async () => {
      const mine = await listRepositories(owner, { source: "hosted" });
      expect(mine.repositories).toEqual([
        expect.objectContaining({ id: repo, canWrite: true }),
      ]);
      expect(
        (await listRepositories(outsider, { source: "hosted" })).repositories,
      ).toEqual([]);
      const tree = await listTree(owner, {
        source: "hosted",
        repo,
        branch: "main",
      });
      expect(tree.files.map((f) => f.path)).toEqual(["README.md"]);
      expect(tree.head).toMatch(/^[0-9a-f]{40}$/);
      await expect(
        listTree(outsider, { source: "hosted", repo, branch: "main" }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("commits several files at once onto a new branch, never onto main", async () => {
      const { head: base } = await listTree(owner, {
        source: "hosted",
        repo,
        branch: "main",
      });
      const changes = [
        { path: "src/app.ts", content: "export const x = 1;\n" },
        { path: "README.md", content: "# Updated\n" },
      ];
      await expect(
        commitChanges(req, sessionOf(owner), {
          source: "hosted",
          repo,
          branch: "main",
          expectedHead: base,
          message: "Edit two files",
          changes,
        }),
      ).rejects.toMatchObject({ status: 403 });
      const result = await commitChanges(req, sessionOf(owner), {
        source: "hosted",
        repo,
        branch: "main",
        expectedHead: base,
        newBranch: "feature/edit",
        message: "Edit two files",
        changes,
      });
      expect(result.branch).toBe("feature/edit");
      const tree = await listTree(owner, {
        source: "hosted",
        repo,
        branch: "feature/edit",
      });
      expect(tree.files.map((f) => f.path).sort()).toEqual([
        "README.md",
        "src/app.ts",
      ]);
      expect(
        (
          await readFile(owner, {
            source: "hosted",
            repo,
            branch: "feature/edit",
            path: "README.md",
          })
        ).content,
      ).toBe("# Updated\n");
      // A stale head is refused instead of overwriting newer work.
      await expect(
        commitChanges(req, sessionOf(owner), {
          source: "hosted",
          repo,
          branch: "feature/edit",
          expectedHead: base,
          message: "Stale edit",
          changes: [{ path: "src/app.ts", content: null }],
        }),
      ).rejects.toMatchObject({ status: 409 });
      await commitChanges(req, sessionOf(owner), {
        source: "hosted",
        repo,
        branch: "feature/edit",
        expectedHead: tree.head,
        message: "Remove a file",
        changes: [{ path: "src/app.ts", content: null }],
      });
      expect(
        (
          await listTree(owner, {
            source: "hosted",
            repo,
            branch: "feature/edit",
          })
        ).files.map((f) => f.path),
      ).toEqual(["README.md"]);
    });

    it("refuses outsiders, unsafe paths and oversized commits", async () => {
      const { head: base } = await listTree(owner, {
        source: "hosted",
        repo,
        branch: "main",
      });
      const commit = (uid: string, changes: unknown[]) =>
        commitChanges(req, sessionOf(uid), {
          source: "hosted",
          repo,
          branch: "main",
          expectedHead: base,
          newBranch: "feature/x",
          message: "Attempt",
          changes,
        });
      await expect(
        commit(outsider, [{ path: "a.txt", content: "x" }]),
      ).rejects.toMatchObject({ status: 404 });
      for (const path of ["../escape", "a//b", "/abs", "a\\b"])
        await expect(
          commit(owner, [{ path, content: "x" }]),
        ).rejects.toMatchObject({ status: 400 });
      await expect(
        commit(owner, [{ path: "big.txt", content: "x".repeat(1048577) }]),
      ).rejects.toMatchObject({ status: 413 });
    });
  });

  describe("GitHub repositories", () => {
    type Call = { url: string; method: string; body?: unknown; auth?: string };
    let calls: Call[];
    const respond = (routes: Record<string, unknown>) => {
      calls = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit = {}) => {
          const method = init.method ?? "GET";
          const headers = (init.headers ?? {}) as Record<string, string>;
          calls.push({
            url,
            method,
            body: init.body ? JSON.parse(String(init.body)) : undefined,
            auth: headers.Authorization,
          });
          const key = `${method} ${url.replace("https://api.github.com", "")}`;
          const match = Object.entries(routes).find(([k]) => key.startsWith(k));
          if (!match) return new Response("{}", { status: 404 });
          const value = match[1];
          return value instanceof Response
            ? value
            : new Response(JSON.stringify(value), { status: 200 });
        }),
      );
    };
    const connect = () =>
      pool.query(
        "INSERT INTO github_connections(user_id,github_user_id,login,encrypted_token,scopes) VALUES($1,'1','octo',$2,'repo')",
        [owner, seal("gho_secret_token", "github-token")],
      );
    const branchRoute = {
      "GET /repos/octo/app/branches/main": {
        commit: { sha: head(1), commit: { tree: { sha: head(2) } } },
      },
    };

    it("asks to connect first, and never returns the token", async () => {
      await expect(
        listRepositories(owner, { source: "github" }),
      ).rejects.toMatchObject({ code: "GITHUB_NOT_CONNECTED" });
      await connect();
      respond({
        "GET /user/repos": [
          {
            full_name: "octo/app",
            private: true,
            default_branch: "main",
            permissions: { push: true },
          },
        ],
      });
      const result = await listRepositories(owner, { source: "github" });
      expect(result.repositories).toEqual([
        {
          id: "octo/app",
          name: "octo/app",
          private: true,
          defaultBranch: "main",
          canWrite: true,
        },
      ]);
      expect(calls[0]!.auth).toBe("Bearer gho_secret_token");
      expect(JSON.stringify(result)).not.toContain("gho_");
      const exported = await transaction((tx) => exportAccount(tx, owner));
      expect(JSON.stringify(exported)).not.toContain("encrypted_token");
      expect(exported.data["github_connections.user_id"]).toHaveLength(1);
    });

    it("lists regular files only", async () => {
      await connect();
      respond({
        ...branchRoute,
        [`GET /repos/octo/app/git/trees/${head(2)}`]: {
          truncated: false,
          tree: [
            { path: "src", type: "tree", mode: "040000" },
            { path: "src/a.ts", type: "blob", mode: "100644", size: 3 },
            { path: "run.sh", type: "blob", mode: "100755", size: 9 },
            { path: "link", type: "blob", mode: "120000", size: 4 },
            { path: "vendor", type: "commit", mode: "160000" },
          ],
        },
      });
      const tree = await listTree(owner, {
        source: "github",
        repo: "octo/app",
        branch: "main",
      });
      expect(tree).toEqual({
        head: head(1),
        files: [
          { path: "src/a.ts", size: 3 },
          { path: "run.sh", size: 9 },
        ],
        truncated: false,
      });
    });

    it("commits several files in one commit, keeping file modes, without forcing", async () => {
      await connect();
      respond({
        ...branchRoute,
        [`GET /repos/octo/app/git/trees/${head(2)}`]: {
          truncated: false,
          tree: [{ path: "run.sh", type: "blob", mode: "100755" }],
        },
        "POST /repos/octo/app/git/trees": { sha: head(3) },
        "POST /repos/octo/app/git/commits": { sha: head(4) },
        "PATCH /repos/octo/app/git/refs/heads/main": {},
      });
      const result = await commitChanges(req, sessionOf(owner), {
        source: "github",
        repo: "octo/app",
        branch: "main",
        expectedHead: head(1),
        message: "Edit from ProofStack",
        changes: [
          { path: "run.sh", content: "echo hi\n" },
          { path: "old.txt", content: null },
        ],
      });
      expect(result).toEqual({
        message: "Committed to GitHub",
        branch: "main",
        head: head(4),
      });
      const tree = calls.find((c) => c.url.endsWith("/git/trees"))!;
      expect(tree.body).toEqual({
        base_tree: head(2),
        tree: [
          {
            path: "run.sh",
            mode: "100755",
            type: "blob",
            content: "echo hi\n",
          },
          { path: "old.txt", mode: "100644", type: "blob", sha: null },
        ],
      });
      expect(calls.find((c) => c.url.endsWith("/git/commits"))!.body).toEqual({
        message: "Edit from ProofStack",
        tree: head(3),
        parents: [head(1)],
      });
      expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({
        sha: head(4),
        force: false,
      });
    });

    it("refuses a stale head and drops a revoked connection", async () => {
      await connect();
      respond(branchRoute);
      await expect(
        commitChanges(req, sessionOf(owner), {
          source: "github",
          repo: "octo/app",
          branch: "main",
          expectedHead: head(9),
          message: "Stale",
          changes: [{ path: "a", content: "b" }],
        }),
      ).rejects.toMatchObject({ code: "BRANCH_MOVED" });
      respond({
        "GET /repos/octo/app/branches": new Response("{}", { status: 401 }),
      });
      await expect(
        listTree(owner, { source: "github", repo: "octo/app", branch: "main" }),
      ).rejects.toMatchObject({ code: "GITHUB_RECONNECT" });
      expect(
        (
          await pool.query(
            "SELECT 1 FROM github_connections WHERE user_id=$1",
            [owner],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        listTree(owner, { source: "github", repo: "../etc", branch: "main" }),
      ).rejects.toBeTruthy();
    });

    it("connects only when the returned state matches, and answers with a page instead of a redirect", async () => {
      vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "client-id");
      vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "client-secret");
      identity.uid = owner;
      const csrf = signedNonce();
      const started = await request(app)
        .post("/api/editor/github/connect")
        .set("Origin", origin)
        .set("Cookie", `__Host-ps-csrf=${csrf}`)
        .set("X-CSRF-Token", csrf)
        .send({});
      expect(started.status).toBe(200);
      const url = new URL(started.body.authorizeUrl);
      expect(url.origin).toBe("https://github.com");
      expect(url.searchParams.get("scope")).toBe("repo");
      expect(url.searchParams.get("redirect_uri")).toBe(
        `${origin}/api/editor/github/callback`,
      );
      const state = url.searchParams.get("state")!;
      const cookie = (started.headers["set-cookie"] as unknown as string[])
        .find((c) => c.startsWith("__Host-ps-github-state="))!
        .split(";")[0];
      expect(cookie).toBe(`__Host-ps-github-state=${state}`);
      const bad = await request(app)
        .get("/api/editor/github/callback")
        .query({ code: "x", state: signedNonce() })
        .set("Cookie", cookie);
      expect(bad.status).toBe(200);
      expect(bad.headers.location).toBeUndefined();
      expect(bad.text).toContain("/code?github=failed");
      // The fake GitHub API answers the token exchange and the user lookup.
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async (u: string) =>
            new Response(
              JSON.stringify(
                u.includes("access_token")
                  ? { access_token: "gho_new", scope: "repo" }
                  : { id: 7, login: "octo" },
              ),
              { status: 200 },
            ),
        ),
      );
      const good = await request(app)
        .get("/api/editor/github/callback")
        .query({ code: "abc", state })
        .set("Cookie", cookie);
      expect(good.text).toContain("/code?github=connected");
      const row = (
        await pool.query(
          "SELECT login,encrypted_token FROM github_connections WHERE user_id=$1",
          [owner],
        )
      ).rows[0];
      expect(row.login).toBe("octo");
      expect(row.encrypted_token).not.toContain("gho_new");
    });
  });
});
