import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express, {
  type Express,
  type IRouter,
  type RequestHandler,
} from "express";
import request from "supertest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
// Any database use by a placeholder fails the test: only `pool` exists, and
// every call on it is counted.
vi.mock("@workspace/db", () => ({
  pool: { query: queryMock, connect: queryMock },
}));

import { errorHandler } from "../artifacts/api-server/src/middlewares/error-handler";
import { signedNonce } from "../artifacts/api-server/src/lib/auth-crypto";

// The API's own cookie parser, as app.ts mounts it.
const cookieParser = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
)("cookie-parser") as () => RequestHandler;

const routes = `${process.cwd()}/artifacts/api-server/src/routes`;
const SITE = "https://app.example";
const ATTEMPT = "3f1c2a9e-8b7d-4c6f-9a1e-0b2d4f6a8c1e";
const MEDIA = "cc1575d2-514f-42fb-97b4-f6b6b7503a76";

type Write = { method: "post" | "put"; path: string };
type Stub = {
  file: string;
  // Views.
  gets: string[];
  // Browser writes: CSRF first.
  writes: Write[];
  // Provider calls: a server with no Origin header.
  hooks: string[];
};
const post = (path: string): Write => ({ method: "post", path });

// Every address of section 12 of the specification, one router file per area.
const STUBS: Stub[] = [
  {
    file: "platform",
    gets: ["/platform"],
    writes: [post("/platform/action")],
    hooks: [],
  },
  { file: "mail-hooks", gets: [], writes: [], hooks: ["/platform/hooks/mail"] },
  {
    file: "media",
    gets: ["/media", `/media/${MEDIA}`],
    writes: [
      post("/media/action"),
      { method: "put", path: `/media/${MEDIA}/content` },
    ],
    hooks: [],
  },
  { file: "media-hooks", gets: [], writes: [], hooks: ["/media/hooks/video"] },
  {
    file: "social",
    gets: ["/social"],
    writes: [post("/social/action")],
    hooks: [],
  },
  {
    file: "moderation",
    gets: ["/moderation"],
    writes: [post("/moderation/action")],
    hooks: [],
  },
  {
    file: "skills-authoring",
    gets: ["/skills/authoring"],
    writes: [post("/skills/authoring/action")],
    hooks: [],
  },
  {
    file: "skills",
    gets: ["/skills", `/skills/attempts/${ATTEMPT}/state`],
    writes: [
      post("/skills/action"),
      post(`/skills/attempts/${ATTEMPT}/action`),
    ],
    hooks: [],
  },
  {
    file: "skills-interview",
    gets: [],
    writes: [post(`/skills/attempts/${ATTEMPT}/interview`)],
    hooks: [],
  },
  {
    file: "skills-verify",
    gets: ["/skills/verify", "/skills/verify/keys"],
    writes: [],
    hooks: [],
  },
  {
    file: "skills-grading",
    gets: ["/skills/grading"],
    writes: [post("/skills/grading/action")],
    hooks: [],
  },
  {
    file: "education",
    gets: ["/education"],
    writes: [post("/education/action")],
    hooks: [],
  },
  { file: "org-results", gets: ["/org-results"], writes: [], hooks: [] },
  {
    file: "career-checks",
    gets: ["/careers/checks"],
    writes: [post("/careers/checks/action")],
    hooks: [],
  },
];

// One placeholder at a time on a bare app: the parsers and error handler of
// app.ts, and nothing else that could answer for it.
function mount(router: IRouter) {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { id: "test-request", log: { error: vi.fn() } });
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: "32kb", strict: true, inflate: false }));
  app.use("/api", router);
  app.use(errorHandler);
  return app;
}

const unavailable = {
  error: {
    code: "FEATURE_UNAVAILABLE",
    message: "This feature is not available yet",
  },
  requestId: "test-request",
};

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockRejectedValue(new Error("A placeholder used the database"));
  vi.stubEnv("AUTH_APP_ORIGIN", SITE);
  vi.stubEnv("SESSION_SECRET", "r".repeat(40));
});
afterEach(() => vi.unstubAllEnvs());

describe("placeholder API areas", () => {
  it("has a router file for each of the 14 planned areas", () => {
    expect(STUBS.map((stub) => stub.file).sort()).toEqual([
      "career-checks",
      "education",
      "mail-hooks",
      "media",
      "media-hooks",
      "moderation",
      "org-results",
      "platform",
      "skills",
      "skills-authoring",
      "skills-grading",
      "skills-interview",
      "skills-verify",
      "social",
    ]);
    for (const { file } of STUBS)
      expect(existsSync(`${routes}/${file}.ts`), file).toBe(true);
  });

  describe.each(STUBS)("$file", ({ file, gets, writes, hooks }) => {
    const source = readFileSync(`${routes}/${file}.ts`, "utf8");
    // The chunk that builds an area replaces its placeholder and brings its
    // own boundary tests; from then on this block steps aside.
    const placeholder = /^\/\/ Placeholder for /m.test(source);
    let app: Express;
    beforeAll(async () => {
      if (!placeholder) return;
      const module = (await import(`${routes}/${file}.ts`)) as {
        default: IRouter;
      };
      app = mount(module.default);
    });

    describe.skipIf(!placeholder)("while it is a placeholder", () => {
      it("declares exactly the addresses this test calls", () => {
        const declared = [
          ...source.matchAll(/router\.(get|post|put|patch|delete|use|all)\(/g),
        ].map((match) => match[1]);
        expect(declared.sort()).toEqual(
          [
            ...gets.map(() => "get"),
            ...writes.map((write) => write.method),
            ...hooks.map(() => "post"),
          ].sort(),
        );
      });

      it("imports nothing that reads or writes data", () => {
        const imports = [...source.matchAll(/from "([^"]+)"/g)].map(
          (match) => match[1],
        );
        expect(imports).toContain("express");
        for (const name of imports)
          expect([
            "express",
            "../lib/errors",
            "../services/auth-sessions",
          ]).toContain(name);
        // From the session service, only the CSRF check: no session is read.
        expect(source).not.toMatch(/readSession|requireAccount|authLimit/);
      });

      it.each(gets)("GET %s answers 503 with no data", async (path) => {
        for (const send of [
          () => request(app).get(`/api${path}`),
          // A forged identity changes nothing.
          () =>
            request(app)
              .get(`/api${path}`)
              .query({ view: "me", code: "ABCD-1234" })
              .set("X-User-ID", "11111111-1111-4111-8111-111111111111")
              .set("X-Role", "super_admin"),
        ]) {
          const response = await send();
          expect(response.status).toBe(503);
          expect(response.body).toEqual(unavailable);
          expect(response.headers["cache-control"]).toBe("private, no-store");
          expect(response.headers["set-cookie"]).toBeUndefined();
        }
        expect(queryMock).not.toHaveBeenCalled();
      });

      it.each(writes)(
        "$method $path refuses a cross-site caller with 403 CSRF_REJECTED",
        async ({ method, path }) => {
          const token = signedNonce();
          const call = () => request(app)[method](`/api${path}`);
          for (const send of [
            // Another site, with nothing of ours.
            () => call().set("Origin", "https://evil.example"),
            // Another site that somehow holds a valid token pair.
            () =>
              call()
                .set("Origin", "https://evil.example")
                .set("Cookie", `__Host-ps-csrf=${token}`)
                .set("X-CSRF-Token", token),
            // No Origin header at all (a script, not a page of ours).
            () =>
              call()
                .set("Cookie", `__Host-ps-csrf=${token}`)
                .set("X-CSRF-Token", token),
            // Our own origin without the token header.
            () =>
              call()
                .set("Origin", SITE)
                .set("Cookie", `__Host-ps-csrf=${token}`),
            // Our own origin with a token that does not match the cookie.
            () =>
              call()
                .set("Origin", SITE)
                .set("Cookie", `__Host-ps-csrf=${token}`)
                .set("X-CSRF-Token", signedNonce()),
          ]) {
            const response = await send().send({ action: "delete" });
            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe("CSRF_REJECTED");
            expect(Object.keys(response.body).sort()).toEqual([
              "error",
              "requestId",
            ]);
          }
          expect(queryMock).not.toHaveBeenCalled();
        },
      );

      it.each(writes)(
        "$method $path answers 503 FEATURE_UNAVAILABLE to a same-site caller, signed in or not",
        async ({ method, path }) => {
          const token = signedNonce();
          const call = () => request(app)[method](`/api${path}`);
          for (const cookies of [
            // Signed out: the CSRF pair only.
            `__Host-ps-csrf=${token}`,
            // A session cookie is not even looked at.
            `__Host-ps-csrf=${token}; __Host-ps-session=forged`,
          ]) {
            const response = await call()
              .set("Origin", SITE)
              .set("Cookie", cookies)
              .set("X-CSRF-Token", token)
              .send({ action: "grant-save", role: "super_admin" });
            expect(response.status).toBe(503);
            expect(response.body).toEqual(unavailable);
            expect(response.headers["cache-control"]).toBe("private, no-store");
            expect(response.headers["set-cookie"]).toBeUndefined();
          }
          expect(queryMock).not.toHaveBeenCalled();
        },
      );

      it.each(hooks)(
        "POST %s refuses any browser and answers 503 to a server",
        async (path) => {
          const token = signedNonce();
          const call = () => request(app).post(`/api${path}`);
          for (const send of [
            () => call().set("Origin", "https://evil.example"),
            // Not even a page of this site may post here.
            () =>
              call()
                .set("Origin", SITE)
                .set("Cookie", `__Host-ps-csrf=${token}`)
                .set("X-CSRF-Token", token),
          ]) {
            const response = await send().send({ type: "video.ready" });
            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe("CSRF_REJECTED");
          }
          const server = await call()
            .set("Webhook-Signature", "v1,forged")
            .send({ type: "video.ready" });
          expect(server.status).toBe(503);
          expect(server.body).toEqual(unavailable);
          expect(queryMock).not.toHaveBeenCalled();
        },
      );
    });
  });
});

describe("core-only test configuration", () => {
  it("runs *.core-only.test.ts on the core-only database, with the marker those tests gate on", async () => {
    const { default: config } = await import("../vitest.core-only.config");
    expect(config.test?.include).toContain("tests/**/*.core-only.test.ts");
    expect(config.test?.setupFiles).toEqual([
      "./tests/setup.ts",
      "./tests/embedded-core-db.ts",
    ]);
    expect(config.test?.env).toEqual({ CORE_ONLY_DB: "1" });
    // One engine per file, one file at a time, as the embedded configuration.
    expect(config.test?.fileParallelism).toBe(false);
    expect(config.test?.maxWorkers).toBe(1);
  });

  it("stops the journal at the last core migration whatever comes after it", () => {
    const harness = readFileSync(
      `${process.cwd()}/tests/embedded-core-db.ts`,
      "utf8",
    );
    expect(harness).toContain("const LAST_CORE_INDEX = 21;");
    expect(harness).toContain('const LAST_CORE_TAG = "0021_retired_handles";');
    expect(harness).toContain("entry.idx <= LAST_CORE_INDEX");
    const journal = JSON.parse(
      readFileSync(
        `${process.cwd()}/lib/db/drizzle/meta/_journal.json`,
        "utf8",
      ),
    ) as { entries: Array<{ idx: number; tag: string }> };
    expect(journal.entries[21]).toMatchObject({
      idx: 21,
      tag: "0021_retired_handles",
    });
  });
});

// Runs under vitest.core-only.config.ts only (pnpm test:core-only).
describe.skipIf(process.env.CORE_ONLY_DB !== "1")("core-only database", () => {
  it("holds the core tables of migrations 0000 to 0021 and no module table", async () => {
    const { pool } =
      await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    );
    const names = tables.rows.map(
      (row: { table_name: string }) => row.table_name,
    );
    expect(names).toHaveLength(54);
    // First and last core migrations.
    expect(names).toEqual(
      expect.arrayContaining(["users", "audit_logs", "retired_handles"]),
    );
    // Migration 0022 (the first module migration) was not replayed.
    for (const moduleTable of [
      "platform_grants",
      "organization_accounts",
      "organization_member_grants",
      "entitlements",
      "entitlement_uses",
      "work_jobs",
      "hook_receipts",
      "mail_suppressions",
      "skill_ledger",
      "skill_ledger_checkpoints",
      "ai_usage",
      "ai_budgets",
    ])
      expect(names, moduleTable).not.toContain(moduleTable);
    // The harness executes real SQL: a core read works, a module read fails.
    await expect(
      pool.query("SELECT count(*)::int AS n FROM retired_handles"),
    ).resolves.toMatchObject({ rows: [{ n: 0 }] });
    await expect(pool.query("SELECT 1 FROM platform_grants")).rejects.toThrow(
      /platform_grants/,
    );
  });
});
