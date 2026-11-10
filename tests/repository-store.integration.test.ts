import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
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
import { pool } from "@workspace/db";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
import { r2 } from "../artifacts/api-server/src/lib/objectStorage";
import {
  getRepositories,
  runRepositoryAction,
} from "../artifacts/api-server/src/services/repositories";
import {
  commitChanges,
  listTree,
  readFile,
} from "../artifacts/api-server/src/services/editor";

const sessionOf = (id: string) =>
  ({
    user: { id, platformRole: null },
    aal: "aal2",
    row: { last_mfa_at: new Date(), created_at: new Date() },
    providerUser: { factors: [{ status: "verified", factor_type: "totp" }] },
  }) as unknown as AuthSession;
// A request as the rate limits see it (documentation address).
const req = {
  id: randomUUID(),
  get: () => undefined,
  headers: {},
  ip: "192.0.2.10",
  socket: { remoteAddress: "192.0.2.10" },
} as never;

// A fake R2: objects kept in memory, optionally failing writes.
const objects = new Map<string, Buffer>();
const types = new Map<string, string>();
let failWrites = false;
function fakeR2() {
  vi.spyOn(r2, "client").mockReturnValue({
    send: async (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => {
      const key = `${command.input.Bucket}/${command.input.Key}`;
      if (command.constructor.name === "PutObjectCommand") {
        if (failWrites) throw new Error("R2 unavailable");
        objects.set(key, Buffer.from(command.input.Body as Buffer));
        types.set(key, String(command.input.ContentType));
        return {};
      }
      if (command.constructor.name === "ListObjectsV2Command") {
        const start = `${command.input.Bucket}/${command.input.Prefix}`;
        return {
          Contents: [...objects.keys()]
            .filter((k) => k.startsWith(start))
            .map((k) => ({
              Key: k.slice(String(command.input.Bucket).length + 1),
            })),
          IsTruncated: false,
        };
      }
      if (command.constructor.name === "DeleteObjectsCommand") {
        const del = command.input.Delete as { Objects: { Key: string }[] };
        for (const o of del.Objects)
          objects.delete(`${command.input.Bucket}/${o.Key}`);
        return {};
      }
      if (command.constructor.name === "GetObjectCommand") {
        const body = objects.get(key);
        if (!body)
          throw Object.assign(new Error("NoSuchKey"), {
            $metadata: { httpStatusCode: 404 },
          });
        return {
          Body: { transformToByteArray: async () => new Uint8Array(body) },
        };
      }
      throw new Error("unexpected command " + command.constructor.name);
    },
  } as never);
}

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Repositories saved to R2",
  () => {
    let owner: string, project: string, root: string;
    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), "ps-store-"));
      vi.stubEnv("REPOSITORY_ROOT", root);
      vi.stubEnv("REPOSITORY_STORE", "r2");
      vi.stubEnv("SESSION_SECRET", "store-test-only-secret-at-least-32-chars");
      vi.stubEnv("PRIVATE_OBJECT_DIR", "/test-bucket/private");
      objects.clear();
      failWrites = false;
      fakeR2();
      owner = randomUUID();
      project = randomUUID();
      await pool.query("DELETE FROM rate_limit_buckets");
      await pool.query(
        "INSERT INTO users(id,auth_subject,email) VALUES($1,$2,$3)",
        [owner, owner, owner + "@example.test"],
      );
      await pool.query(
        "INSERT INTO profiles(user_id,display_name,handle) VALUES($1,'Store user',$2)",
        [owner, "s" + owner.replace(/-/g, "").slice(0, 14)],
      );
      await pool.query(
        "INSERT INTO community_projects(id,owner_id,slug,title,description,visibility) VALUES($1,$2,$3,'Store project','Fixture','private')",
        [project, owner, project],
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await pool.query("DELETE FROM users WHERE id=$1", [owner]);
      await rm(root, { recursive: true, force: true });
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      await pool.end();
    });

    it("saves on every change and restores after the disk is wiped", async () => {
      const repo = (
        await runRepositoryAction(req, sessionOf(owner), {
          action: "create",
          projectId: project,
        })
      ).id;
      const key = `test-bucket/private/repositories/${repo}.bundle`;
      expect(objects.has(key)).toBe(true);
      const created = objects.get(key)!.length;
      const { head } = await listTree(owner, {
        source: "hosted",
        repo,
        branch: "main",
      });
      await commitChanges(req, sessionOf(owner), {
        source: "hosted",
        repo,
        branch: "main",
        expectedHead: head,
        newBranch: "feature/store",
        message: "Add app",
        changes: [{ path: "src/app.py", content: "print('saved')\n" }],
      });
      expect(objects.get(key)!.length).toBeGreaterThan(created);

      // A restart on an ephemeral disk: the repository folder is gone.
      await rm(join(root, `${repo}.git`), { recursive: true, force: true });
      const restored = await listTree(owner, {
        source: "hosted",
        repo,
        branch: "feature/store",
      });
      expect(restored.files.map((f) => f.path).sort()).toEqual([
        "README.md",
        "src/app.py",
      ]);
      expect(
        (
          await readFile(owner, {
            source: "hosted",
            repo,
            branch: "feature/store",
            path: "src/app.py",
          })
        ).content,
      ).toBe("print('saved')\n");
      // And work continues on the restored copy.
      await commitChanges(req, sessionOf(owner), {
        source: "hosted",
        repo,
        branch: "feature/store",
        expectedHead: restored.head,
        message: "Second change",
        changes: [{ path: "src/app.py", content: "print('again')\n" }],
      });
    });

    it("refuses a change it cannot save, leaving the database unchanged", async () => {
      const repo = (
        await runRepositoryAction(req, sessionOf(owner), {
          action: "create",
          projectId: project,
        })
      ).id;
      const { head } = await listTree(owner, {
        source: "hosted",
        repo,
        branch: "main",
      });
      failWrites = true;
      await expect(
        commitChanges(req, sessionOf(owner), {
          source: "hosted",
          repo,
          branch: "main",
          expectedHead: head,
          newBranch: "feature/lost",
          message: "Will not save",
          changes: [{ path: "a.txt", content: "x" }],
        }),
      ).rejects.toMatchObject({ status: 503 });
      // Creating the branch is its own step and may succeed; the commit that
      // could not be saved must not move it.
      const heads = (
        await pool.query(
          "SELECT name,head FROM repository_branches WHERE repository_id=$1 ORDER BY name",
          [repo],
        )
      ).rows;
      expect(heads.length).toBeGreaterThan(0);
      expect(heads.every((b) => b.head === head)).toBe(true);
    });

    it("publishes a public repository's site as its demo, and unpublishes it", async () => {
      vi.stubEnv("DEMO_ORIGIN", "https://demos.example");
      vi.stubEnv("AUTH_APP_ORIGIN", "https://proofstack.example");
      await pool.query(
        "UPDATE community_projects SET visibility='public' WHERE id=$1",
        [project],
      );
      const handle = (
        await pool.query("SELECT handle FROM profiles WHERE user_id=$1", [
          owner,
        ])
      ).rows[0].handle as string;
      const repo = (
        await runRepositoryAction(req, sessionOf(owner), {
          action: "create",
          projectId: project,
          name: "Site-App",
        })
      ).id;
      const { head } = await listTree(owner, {
        source: "hosted",
        repo,
        branch: "main",
      });
      // main has only a README: there is nothing to publish yet.
      await expect(
        runRepositoryAction(req, sessionOf(owner), {
          action: "demo-publish",
          id: repo,
          branch: "main",
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining("index.html"),
      });
      await commitChanges(req, sessionOf(owner), {
        source: "hosted",
        repo,
        branch: "main",
        expectedHead: head,
        newBranch: "site",
        message: "Add a site",
        changes: [
          { path: "dist/index.html", content: "<h1>Hello</h1>" },
          { path: "dist/css/site.css", content: "h1{color:red}" },
          { path: "src/app.ts", content: "export {}" },
        ],
      });
      const published = await runRepositoryAction(req, sessionOf(owner), {
        action: "demo-publish",
        id: repo,
        branch: "site",
      });
      const url = `https://demos.example/${handle}/site-app/`;
      expect(published.message).toBe(`Demo published at ${url}`);
      const base = `test-bucket/private/demos/${handle}/site-app/`;
      const demoKeys = [...objects.keys()]
        .filter((k) => k.startsWith(base))
        .sort();
      // The dist folder becomes the site; sources outside it are not published.
      expect(demoKeys).toEqual([base + "css/site.css", base + "index.html"]);
      expect(objects.get(base + "index.html")!.toString()).toBe(
        "<h1>Hello</h1>",
      );
      expect(types.get(base + "css/site.css")).toBe("text/css");
      const demoUrlOf = async () =>
        (
          await pool.query(
            "SELECT demo_url FROM community_projects WHERE id=$1",
            [project],
          )
        ).rows[0].demo_url;
      expect(await demoUrlOf()).toBe(url);
      const view = await getRepositories({ id: repo }, owner);
      expect([view.demoAvailable, view.demoUrl]).toEqual([true, url]);

      // Unpublishing removes every file and clears the Demo URL.
      await runRepositoryAction(req, sessionOf(owner), {
        action: "demo-unpublish",
        id: repo,
      });
      expect([...objects.keys()].some((k) => k.startsWith(base))).toBe(false);
      expect(await demoUrlOf()).toBe("");

      // Private projects never publish: anyone can open a demo.
      await pool.query(
        "UPDATE community_projects SET visibility='private' WHERE id=$1",
        [project],
      );
      await expect(
        runRepositoryAction(req, sessionOf(owner), {
          action: "demo-publish",
          id: repo,
          branch: "site",
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect([...objects.keys()].some((k) => k.startsWith(base))).toBe(false);
    });

    it("reports a repository with no saved copy as unavailable", async () => {
      const repo = (
        await runRepositoryAction(req, sessionOf(owner), {
          action: "create",
          projectId: project,
        })
      ).id;
      objects.clear();
      await rm(join(root, `${repo}.git`), { recursive: true, force: true });
      await expect(
        listTree(owner, { source: "hosted", repo, branch: "main" }),
      ).rejects.toMatchObject({ status: 503 });
    });
  },
);
