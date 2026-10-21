import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { checkReadiness } from "../artifacts/api-server/src/services/health";

const path = `${process.cwd()}/artifacts/api-server/scripts/preflight-schema.mjs`;

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "read-only complete product-schema preflight",
  () => {
    afterAll(async () => pool.end());

    it("checks every latest-snapshot table, column, index and constraint against migrated PostgreSQL", async () => {
      const { inspectProductSchema, inspectCommunityGrants } = await import(
        path
      );
      expect(await inspectProductSchema(pool)).toEqual({
        requiredProductSchema: true,
        requiredIndexes: true,
        requiredConstraints: true,
        expectedTableCount: 50,
      });
      expect(await inspectCommunityGrants(pool)).toBe(true);
      expect(await checkReadiness()).toEqual({
        status: "ready",
        checks: { database: "ready" },
      });
    });

    it("rejects an empty schema even when the database connection works", async () => {
      const { inspectProductSchema } = await import(path);
      const schema = `audit_${randomUUID().replaceAll("-", "")}`;
      await pool.query(`CREATE SCHEMA "${schema}"`);
      try {
        expect(await inspectProductSchema(pool, schema)).toEqual({
          requiredProductSchema: false,
          requiredIndexes: false,
          requiredConstraints: false,
          expectedTableCount: 50,
        });
      } finally {
        await pool.query(`DROP SCHEMA "${schema}"`);
      }
    });

    it("does not treat an incomplete/extra system role mapping as a valid baseline", async () => {
      const { inspectCommunityGrants } = await import(path);
      expect(
        await inspectCommunityGrants({ query: async () => ({ rows: [] }) }),
      ).toBe(false);
      expect(
        await inspectCommunityGrants({
          query: async () => ({
            rows: [
              {
                role: "organization_member",
                permission: "community.organization.members",
              },
            ],
          }),
        }),
      ).toBe(false);
    });

    it("rejects a missing or drifted migration ledger without executing DDL", async () => {
      const { inspectMigrationHistory } = await import(path);
      expect(
        await inspectMigrationHistory({
          query: async () => ({ rows: [{ present: false }] }),
        }),
      ).toBe(false);
      let calls = 0;
      expect(
        await inspectMigrationHistory({
          query: async () =>
            ++calls === 1
              ? { rows: [{ present: true }] }
              : { rows: [{ hash: "wrong", timestamp: "0" }] },
        }),
      ).toBe(false);
      expect(calls).toBe(2);
    });
  },
);
