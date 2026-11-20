import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { pool } from "@workspace/db";
import {
  eraseAccount,
  exportAccount,
} from "../artifacts/api-server/src/services/account-data";
import { checkReadiness } from "../artifacts/api-server/src/services/health";
import {
  moduleReadySync,
  resetModuleReadiness,
} from "../artifacts/api-server/src/services/module-ready";
import { getCommunity } from "../artifacts/api-server/src/services/community-query";
import app from "../artifacts/api-server/src/app";

const coreOnly = process.env.CORE_ONLY_DB === "1";

describe.skipIf(!coreOnly)(
  "core services while module tables are absent",
  () => {
    afterAll(async () => pool.end());

    it("serves auth context, feed and notifications with only core tables", async () => {
      resetModuleReadiness();
      vi.stubEnv("AUTH_APP_ORIGIN", "https://app.example.test");
      vi.stubEnv("SESSION_SECRET", "core-only-session-secret-0123456789abcdef");
      vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
      vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
      vi.stubEnv("SUPABASE_SECRET_KEY", "secret-test-key");
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ external: { email: true } }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        ),
      );

      const context = await request(app).get("/api/auth/context");
      expect(context.status, JSON.stringify(context.body)).toBe(200);
      expect(context.body.authenticated).toBe(false);
      expect(context.body.capabilities).toBeDefined();

      const uid = randomUUID();
      await pool.query(
        "INSERT INTO users(id,auth_subject,email) VALUES($1,$2,$3)",
        [uid, `core-${uid}`, `${uid}@example.test`],
      );
      await pool.query(
        "INSERT INTO notifications(user_id,title,body,href) VALUES($1,$2,$3,$4)",
        [
          uid,
          "New device signed in",
          "A notice without module tables",
          "/account",
        ],
      );
      const feed = await getCommunity({ view: "feed" }, null);
      expect(feed.posts).toEqual([]);
      const notifications = await getCommunity({ view: "notifications" }, uid);
      expect(notifications.notifications).toHaveLength(1);
      expect(notifications.notifications[0]?.title).toBe(
        "New device signed in",
      );

      expect((await checkReadiness()).status).toBe("ready");
      expect(moduleReadySync("platform")).toBe(false);
      expect(moduleReadySync("media")).toBe(false);
      expect(moduleReadySync("social")).toBe(false);

      await pool.query(
        "INSERT INTO assessment_attempts(user_id,assessment_id,question_version,snapshot) VALUES($1,'core-export',1,$2::jsonb)",
        [
          uid,
          JSON.stringify({ questions: [{ correctOptionId: "never-export" }] }),
        ],
      );
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const exported = await exportAccount(client, uid);
        expect(JSON.stringify(exported)).not.toContain("correctOptionId");
        expect(JSON.stringify(exported)).not.toContain("never-export");
        await eraseAccount(client, uid);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      expect(
        (await pool.query("SELECT id FROM users WHERE id=$1", [uid])).rows,
      ).toEqual([]);
    });
  },
);
