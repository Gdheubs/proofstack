import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Request, Response } from "express";
import { pool } from "@workspace/db";

// Only the identity provider's admin API is replaced; SQL and policy are real.
const provider = vi.hoisted(() => ({ deleteUser: vi.fn() }));
vi.mock(
  "../artifacts/api-server/src/services/auth-provider",
  async (original) => ({
    ...(await original<
      typeof import("../artifacts/api-server/src/services/auth-provider")
    >()),
    adminClient: () => ({
      auth: { admin: { deleteUser: provider.deleteUser } },
    }),
  }),
);
import { runAction } from "../artifacts/api-server/src/services/auth-actions";
import {
  requireAccount,
  type AuthSession,
} from "../artifacts/api-server/src/services/auth-sessions";
import { exportAccount } from "../artifacts/api-server/src/services/account-data";
import { applyRetention } from "../artifacts/api-server/src/services/auth-cleanup";
import {
  TERMS_VERSION,
  ageOn,
} from "../artifacts/api-server/src/services/legal";
import { transaction } from "../artifacts/api-server/src/services/auth-sessions";

const yearsAgo = (years: number, days = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Age, consent, data export and account deletion",
  () => {
    let uid: string, subject: string;
    const req = () =>
      ({
        ip: "203.0.113.50",
        id: randomUUID(),
        headers: {},
        get: () => undefined,
      }) as unknown as Request;
    const res = () =>
      ({ clearCookie: vi.fn(), cookie: vi.fn() }) as unknown as Response;
    const session = (overrides: Partial<AuthSession["row"]> = {}) =>
      ({
        provider: "supabase",
        user: { id: uid, platformRole: null, agreementRequired: true },
        aal: "aal1",
        row: { id: randomUUID(), created_at: new Date(), ...overrides },
        providerUser: { factors: [] },
      }) as unknown as AuthSession;
    const exists = async () =>
      (await pool.query("SELECT 1 FROM users WHERE id=$1", [uid])).rows.length;
    beforeEach(async () => {
      process.env.SESSION_SECRET = "legal-rights-test-secret-at-least-32-chars";
      uid = randomUUID();
      subject = randomUUID();
      provider.deleteUser.mockReset();
      provider.deleteUser.mockResolvedValue({ data: {}, error: null });
      await pool.query("DELETE FROM rate_limit_buckets");
      await pool.query(
        "INSERT INTO users(id,auth_subject,email,phone) VALUES($1,$2,$3,'+919000000001')",
        [uid, subject, `${uid}@example.test`],
      );
      await pool.query(
        "INSERT INTO profiles(user_id,display_name,handle) VALUES($1,'Legal fixture',$2)",
        [uid, `legal-${uid.slice(0, 8)}`],
      );
    });
    afterEach(async () => {
      await pool.query("DELETE FROM users WHERE id=$1", [uid]);
      await pool.query("DELETE FROM deleted_accounts WHERE auth_subject=$1", [
        subject,
      ]);
    });
    afterAll(async () => {
      await pool.end();
    });

    it("computes age to the day", () => {
      expect(ageOn(yearsAgo(18))).toBe(18);
      expect(ageOn(yearsAgo(18, 1))).toBe(17);
    });

    it("blocks account use until the agreement is given, except export and deletion", () => {
      expect(() => requireAccount(session())).toThrow(
        expect.objectContaining({ code: "AGREEMENT_REQUIRED" }),
      );
      expect(
        requireAccount(session(), { allowPendingAgreement: true }),
      ).toBeTruthy();
    });

    it("records an adult's birth date and consent, and never lets it change", async () => {
      await runAction(
        req(),
        res(),
        { action: "accept-terms", birthDate: yearsAgo(30), acceptTerms: true },
        session(),
      );
      const consent = await pool.query(
        "SELECT version FROM consent_records WHERE user_id=$1",
        [uid],
      );
      expect(consent.rows).toEqual([{ version: TERMS_VERSION }]);
      await runAction(
        req(),
        res(),
        { action: "accept-terms", birthDate: yearsAgo(40), acceptTerms: true },
        session(),
      );
      const stored = await pool.query(
        "SELECT to_char(birth_date,'YYYY-MM-DD') AS d FROM users WHERE id=$1",
        [uid],
      );
      expect(stored.rows[0].d).toBe(yearsAgo(30));
    });

    it("erases an under-18 account instead of keeping it", async () => {
      const response = res();
      await expect(
        runAction(
          req(),
          response,
          {
            action: "accept-terms",
            birthDate: yearsAgo(17),
            acceptTerms: true,
          },
          session(),
        ),
      ).rejects.toMatchObject({ code: "AGE_REQUIREMENT" });
      expect(await exists()).toBe(0);
      expect(provider.deleteUser).toHaveBeenCalledWith(subject);
      expect(response.clearCookie).toHaveBeenCalled();
    });

    it("refuses sign-up for under-18s before any account is created", async () => {
      await expect(
        runAction(
          req(),
          res(),
          {
            action: "signup",
            email: "minor@example.test",
            password: "a-long-test-password",
            displayName: "Minor",
            kind: "developer",
            birthDate: yearsAgo(16),
            acceptTerms: true,
          },
          null,
        ),
      ).rejects.toMatchObject({ code: "AGE_REQUIREMENT" });
    });

    it("exports the account's data without secrets", async () => {
      await pool.query(
        "INSERT INTO sessions(user_id,provider_session_id,handle_hash,expires_at,encrypted_credentials,device_label) VALUES($1,$2,'secret-hash',now()+interval '1 hour','secret-credentials','Chrome on Windows')",
        [uid, randomUUID()],
      );
      const data = await transaction((tx) => exportAccount(tx, uid));
      expect(data.account.email).toBe(`${uid}@example.test`);
      expect(data.data["profiles.user_id"]).toHaveLength(1);
      expect(data.data["sessions.user_id"]![0]!.device_label).toBe(
        "Chrome on Windows",
      );
      const text = JSON.stringify(data);
      expect(text).not.toContain("secret-hash");
      expect(text).not.toContain("secret-credentials");
    });

    it("deletes the account, keeps registration details for 180 days, then purges them", async () => {
      await expect(
        runAction(
          req(),
          res(),
          { action: "delete-account", confirm: "DELETE" },
          session({ created_at: new Date(Date.now() - 10 * 60000) }),
        ),
      ).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
      expect(await exists()).toBe(1);
      const result = await runAction(
        req(),
        res(),
        { action: "delete-account", confirm: "DELETE" },
        session(),
      );
      expect(result).toMatchObject({ signedOut: true });
      expect(await exists()).toBe(0);
      const kept = await pool.query(
        "SELECT email,phone,purge_after>now()+interval '179 days' AS long FROM deleted_accounts WHERE auth_subject=$1",
        [subject],
      );
      expect(kept.rows).toEqual([
        { email: `${uid}@example.test`, phone: "+919000000001", long: true },
      ]);
      await pool.query(
        "UPDATE deleted_accounts SET purge_after=now()-interval '1 second' WHERE auth_subject=$1",
        [subject],
      );
      await applyRetention();
      expect(
        (
          await pool.query(
            "SELECT 1 FROM deleted_accounts WHERE auth_subject=$1",
            [subject],
          )
        ).rows,
      ).toHaveLength(0);
    });

    it("keeps the account if the identity provider refuses deletion", async () => {
      provider.deleteUser.mockResolvedValue({
        data: null,
        error: { message: "unavailable", status: 503 },
      });
      await expect(
        runAction(
          req(),
          res(),
          { action: "delete-account", confirm: "DELETE" },
          session(),
        ),
      ).rejects.toBeTruthy();
      expect(await exists()).toBe(1);
    });

    it("refuses to delete the last owner of an organization", async () => {
      const org = randomUUID();
      await pool.query(
        "INSERT INTO organizations(id,name,slug) VALUES($1,'Owned org',$2)",
        [org, org],
      );
      await pool.query(
        "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key='organization_owner'",
        [org, uid],
      );
      try {
        await expect(
          runAction(
            req(),
            res(),
            { action: "delete-account", confirm: "DELETE" },
            session(),
          ),
        ).rejects.toMatchObject({ code: "LAST_OWNER_DELETION" });
        expect(await exists()).toBe(1);
      } finally {
        await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
      }
    });
  },
);
