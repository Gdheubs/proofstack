import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasPermission } from "../artifacts/api-server/src/services/authorization";
import { writeAuditEvent } from "../artifacts/api-server/src/services/audit";
import { consumeRateLimit } from "../artifacts/api-server/src/services/rate-limit";

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "PostgreSQL service foundations",
  () => {
    let pool: typeof import("@workspace/db").pool;
    beforeAll(async () => {
      pool = (await import("@workspace/db")).pool;
    });
    afterAll(async () => {
      if (pool) await pool.end();
    });

    it("enforces tenant grants, active membership, audit atomicity and fixed-window limiting", async () => {
      const client = await pool.connect();
      const execute = (text: string, values: unknown[]) =>
        client.query(text, values);
      const userId = randomUUID();
      const organizationId = randomUUID();
      const otherOrganization = randomUUID();
      const roleId = randomUUID();
      const permissionId = randomUUID();
      const requestId = randomUUID();
      const key = `integration:${randomUUID()}`;
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO users (id, auth_subject, email) VALUES ($1, $2, $3)",
          [userId, userId, `${userId}@example.test`],
        );
        await client.query(
          "INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)",
          [
            organizationId,
            "Fixture",
            organizationId,
            otherOrganization,
            "Other fixture",
            otherOrganization,
          ],
        );
        await client.query(
          "INSERT INTO roles (id, key, name) VALUES ($1, $2, $3)",
          [roleId, roleId, "Fixture"],
        );
        await client.query(
          "INSERT INTO permissions (id, key, name) VALUES ($1, $2, $3)",
          [permissionId, `organization:read:${permissionId}`, "Fixture"],
        );
        await client.query(
          "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)",
          [roleId, permissionId],
        );
        await client.query(
          "INSERT INTO organization_members (organization_id, user_id, role_id) VALUES ($1, $2, $3)",
          [organizationId, userId, roleId],
        );
        const grant = {
          userId,
          organizationId,
          permission: `organization:read:${permissionId}`,
        };
        expect(await hasPermission(grant, execute)).toBe(true);
        expect(
          await hasPermission(
            { ...grant, organizationId: otherOrganization },
            execute,
          ),
        ).toBe(false);
        await client.query(
          "UPDATE organization_members SET status = 'inactive' WHERE user_id = $1",
          [userId],
        );
        expect(await hasPermission(grant, execute)).toBe(false);
        await client.query(
          "UPDATE organization_members SET status = 'active' WHERE user_id = $1",
          [userId],
        );
        await client.query(
          "UPDATE users SET status = 'disabled' WHERE id = $1",
          [userId],
        );
        expect(await hasPermission(grant, execute)).toBe(false);
        await writeAuditEvent(
          {
            actorUserId: userId,
            organizationId,
            action: "fixture.checked",
            resourceType: "fixture",
            requestId,
          },
          execute,
        );
        expect(
          (
            await client.query(
              "SELECT id FROM audit_logs WHERE request_id = $1",
              [requestId],
            )
          ).rows,
        ).toHaveLength(1);
        expect((await consumeRateLimit(key, 3600, 2, execute)).allowed).toBe(
          true,
        );
        expect((await consumeRateLimit(key, 3600, 2, execute)).allowed).toBe(
          true,
        );
        expect((await consumeRateLimit(key, 3600, 2, execute)).allowed).toBe(
          false,
        );
        await client.query(
          "UPDATE rate_limit_buckets SET window_start = window_start - interval '2 hours' WHERE key = $1",
          [key],
        );
        expect((await consumeRateLimit(key, 3600, 2, execute)).remaining).toBe(
          1,
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      expect(
        (
          await pool.query("SELECT id FROM audit_logs WHERE request_id = $1", [
            requestId,
          ])
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await pool.query(
            "SELECT key FROM rate_limit_buckets WHERE key = $1",
            [key],
          )
        ).rows,
      ).toHaveLength(0);
    });
  },
);
