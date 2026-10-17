// Opt-in only. Never points at a hosted database: run with vitest.embedded.config.ts.
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
const fixture = vi.hoisted(() => ({ session: null as AuthSession | null }));
// Replace only the external identity boundary; production routing, CSRF, services and SQL remain real.
vi.mock(
  "../artifacts/api-server/src/services/auth-sessions",
  async (original) => ({
    ...(await original<
      typeof import("../artifacts/api-server/src/services/auth-sessions")
    >()),
    readSession: async (
      _req: unknown,
      res: { locals: Record<string, unknown> },
    ) => {
      if (fixture.session)
        res.locals.principal = {
          userId: fixture.session.user.id,
          authSubject: "browser-fixture",
        };
      return fixture.session;
    },
  }),
);
// The external provider settings endpoint is not part of this product-flow test.
vi.mock(
  "../artifacts/api-server/src/services/auth-provider",
  async (original) => ({
    ...(await original<
      typeof import("../artifacts/api-server/src/services/auth-provider")
    >()),
    capabilities: async () => ({
      password: false,
      emailOtp: false,
      phoneOtp: false,
      google: false,
      github: false,
      totp: false,
      phoneMfa: false,
      emailDelivery: "development-limited",
      pendingSetup: [],
    }),
  }),
);
import app from "../artifacts/api-server/src/app";
import { pool } from "@workspace/db";
const exec = promisify(execFile);
describe.skipIf(
  process.env.RUN_BROWSER_TESTS !== "1" || process.env.RUN_DB_TESTS !== "1",
)("Real browser platform skill checks", () => {
  it.each(["published", "unclaimed"])(
    "completes the UI flow and saves profile results for a %s owner",
    async (publication) => {
      process.env.AUTH_APP_ORIGIN =
        process.env.PROOFSTACK_BROWSER_URL ?? "https://127.0.0.1:3100";
      process.env.PROOFSTACK_BROWSER_URL = process.env.AUTH_APP_ORIGIN;
      process.env.SESSION_SECRET =
        "browser-test-only-secret-at-least-32-characters";
      const uid = randomUUID();
      await pool.query(
        "INSERT INTO users(id,auth_subject,email,email_verified_at) VALUES($1,$2,'browser@example.test',now())",
        [uid, "browser-fixture"],
      );
      await pool.query(
        "INSERT INTO profiles(user_id,display_name,handle,bio,skills) VALUES($1,'Browser skill-check tester',$2,'Disposable browser test profile','[\"JavaScript\"]'::jsonb)",
        [uid, publication === "published" ? "browser_skill_check" : null],
      );
      const now = new Date();
      fixture.session = {
        user: {
          id: uid,
          displayName: "Browser skill-check tester",
          kind: "developer",
          email: "browser@example.test",
          phone: null,
          emailVerified: true,
          phoneVerified: false,
          platformRole: null,
          status: "active",
          mfaRecoveryRequired: false,
        },
        row: {
          id: randomUUID(),
          user_id: uid,
          created_at: now,
          last_seen_at: now,
          last_mfa_at: now,
          password_recovery: false,
        },
        providerUser: { id: "browser-fixture", factors: [], user_metadata: {} },
        aal: "aal1",
        mfaRequired: false,
        privileged: false,
      } as unknown as AuthSession;
      const server = app.listen(3101, "127.0.0.1");
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("listening", resolve);
          server.once("error", reject);
        });
        console.log(
          "Assessment browser fixture ready: http://127.0.0.1:3101 (real disposable PostgreSQL)",
        );
        const { stdout, stderr } = await exec(
          "python",
          ["tests/browser/skill_checks.py"],
          { cwd: process.cwd(), timeout: 240000, maxBuffer: 1024 * 1024 },
        );
        console.log(stdout);
        if (stderr) console.log(stderr);
        const report = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!);
        const stored = (
          await pool.query(
            "SELECT user_id,result,answers,completed_at FROM assessment_attempts WHERE id=$1",
            [report.completed_attempt],
          )
        ).rows[0];
        expect(stored.user_id).toBe(uid);
        expect(stored.result).toEqual(report.server_result);
        expect(stored.completed_at).toBeInstanceOf(Date);
        expect(Object.keys(stored.answers)).toHaveLength(stored.result.total);
        expect(report.browser_errors).toEqual([]);
        expect(report.navigation_destinations_checked).toBe(15);
        expect(report.responsive_widths_checked).toBe(6);
      } finally {
        fixture.session = null;
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        await pool.query("DELETE FROM users WHERE id=$1", [uid]);
      }
    },
    300000,
  );
});
