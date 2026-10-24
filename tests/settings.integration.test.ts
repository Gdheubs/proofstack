import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { getCommunity } from "../artifacts/api-server/src/services/community-query";
import { runCommunityAction } from "../artifacts/api-server/src/services/community-actions";
import { getCareers } from "../artifacts/api-server/src/services/careers-query";
import { getAssessmentResults } from "../artifacts/api-server/src/services/assessments";
import { getAccount } from "../artifacts/api-server/src/services/auth-account";
import { notify } from "../artifacts/api-server/src/services/community-policy";
import { authActionSchema } from "../artifacts/api-server/src/services/auth-input";
import {
  transaction,
  type AuthSession,
} from "../artifacts/api-server/src/services/auth-sessions";

const sessionOf = (id: string) =>
  ({
    user: { id, platformRole: null },
    aal: "aal2",
    row: {
      id: randomUUID(),
      last_mfa_at: new Date(),
      password_recovery: false,
    },
    providerUser: { factors: [] },
  }) as unknown as AuthSession;
const req = { id: randomUUID(), get: () => undefined } as never;

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Settings: notification preferences and profile visibility",
  () => {
    let me: string, other: string, handle: string;
    beforeEach(async () => {
      process.env.SESSION_SECRET = "settings-test-secret-at-least-32-chars!!";
      me = randomUUID();
      other = randomUUID();
      handle = `set${me.replaceAll("-", "").slice(0, 12)}`;
      await pool.query("DELETE FROM rate_limit_buckets");
      await pool.query(
        "INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) ids(id)",
        [[me, other]],
      );
      await pool.query(
        "INSERT INTO profiles(user_id,display_name,handle,skills) VALUES($1,'Settings person',$2,'[\"react\"]'::jsonb),($3,'Other',$4,'[]'::jsonb)",
        [me, handle, other, `oth${other.replaceAll("-", "").slice(0, 12)}`],
      );
    });
    afterEach(async () => {
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
        [me, other],
      ]);
    });
    afterAll(async () => {
      await pool.end();
    });

    it("saves per-category switches and skips in-app notifications that are off", async () => {
      await runCommunityAction(req, sessionOf(me), {
        action: "notification-preferences-save",
        preferences: {
          activity: { inApp: false, email: true },
          follows: { inApp: true, email: false },
          invitations: { inApp: true, email: true },
          applications: { inApp: true, email: true },
        },
      });
      const account = await getAccount({
        ...sessionOf(me),
        providerUser: { factors: [] },
      } as unknown as AuthSession);
      expect(account.notificationPreferences.activity).toEqual({
        inApp: false,
        email: true,
      });
      expect(account.notificationPreferences.follows.email).toBe(false);
      await transaction(async (tx) => {
        await tx.query(
          "INSERT INTO community_follows(follower_id,following_id) VALUES($1,$2)",
          [other, me],
        );
        await notify(
          tx,
          me,
          other,
          "New comment",
          "Someone commented",
          `/posts/${randomUUID()}`,
        );
        await notify(
          tx,
          me,
          other,
          "New follower",
          "Other started following you",
          `/profile/oth${other.replaceAll("-", "").slice(0, 12)}`,
        );
        // Security notices ignore preferences entirely.
        await notify(
          tx,
          me,
          other,
          "New device signed in",
          "Chrome",
          "/account",
        );
      });
      const titles = (
        await pool.query(
          "SELECT title FROM notifications WHERE user_id=$1 ORDER BY title",
          [me],
        )
      ).rows.map((r) => r.title);
      expect(titles).toEqual(["New device signed in", "New follower"]);
    });

    it("hides a members-only profile from signed-out visitors everywhere", async () => {
      await pool.query(
        "INSERT INTO career_profiles(user_id,headline,roles,availability,discoverable,featured_projects) VALUES($1,'Builder','[]'::jsonb,'open',true,'[]'::jsonb)",
        [me],
      );
      const visible = async (uid: string | null) => ({
        profile: await getCommunity({ view: "profile", handle }, uid)
          .then(() => true)
          .catch(() => false),
        search: (
          await getCommunity(
            { view: "search", type: "developers", q: "Settings" },
            uid,
          )
        ).people.some((p) => p.id === me),
        talent: (await getCareers({ view: "talent" }, uid)).candidates.some(
          (c) => c.id === me,
        ),
        results: await getAssessmentResults(uid, { handle })
          .then(() => true)
          .catch(() => false),
      });
      expect(await visible(null)).toEqual({
        profile: true,
        search: true,
        talent: true,
        results: true,
      });
      await runCommunityAction(req, sessionOf(me), {
        action: "privacy-save",
        profileVisibility: "members",
      });
      expect(await visible(null)).toEqual({
        profile: false,
        search: false,
        talent: false,
        results: false,
      });
      expect(await visible(other)).toEqual({
        profile: true,
        search: true,
        talent: true,
        results: true,
      });
      const person = await getCommunity({ view: "profile", handle }, other);
      expect(person.profile?.visibility).toBe("members");
    });

    it("accepts an email change request and rejects malformed addresses", () => {
      expect(
        authActionSchema.safeParse({
          action: "update-email",
          email: "new@example.test",
        }).success,
      ).toBe(true);
      expect(
        authActionSchema.safeParse({ action: "update-email", email: "nope" })
          .success,
      ).toBe(false);
    });
  },
);
