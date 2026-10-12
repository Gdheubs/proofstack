import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbIntegration = describe.skipIf(process.env.RUN_DB_TESTS !== "1");

dbIntegration("ProofStack PostgreSQL schema integration", () => {
  let pool: typeof import("../src/index").pool;

  beforeAll(async () => {
    const database = await import("../src/index");
    pool = database.pool;
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("enforces tenant/RBAC constraints and persists audit rows transactionally", async () => {
    const client = await pool.connect();
    const userId = randomUUID();
    const organizationId = randomUUID();
    const roleId = randomUUID();
    const permissionId = randomUUID();
    const requestId = `integration-${randomUUID()}`;

    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO users (id, auth_subject, email)
         VALUES ($1, $2, $3)`,
        [userId, `subject-${userId}`, `proofstack-${userId}@example.test`],
      );
      await client.query(
        `INSERT INTO profiles (user_id, display_name)
         VALUES ($1, $2)`,
        [userId, "Integration Fixture"],
      );
      await client.query(
        `INSERT INTO organizations (id, name, slug)
         VALUES ($1, $2, $3)`,
        [organizationId, "Integration Fixture", `fixture-${organizationId}`],
      );
      await client.query(
        `INSERT INTO roles (id, key, name)
         VALUES ($1, $2, $3)`,
        [roleId, `fixture-role-${roleId}`, "Fixture role"],
      );
      await client.query(
        `INSERT INTO permissions (id, key, name)
         VALUES ($1, $2, $3)`,
        [
          permissionId,
          `fixture-permission-${permissionId}`,
          "Fixture permission",
        ],
      );

      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role_id)
         VALUES ($1, $2, $3)`,
        [organizationId, userId, roleId],
      );
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)`,
        [roleId, permissionId],
      );

      await client.query("SAVEPOINT unique_user");
      await expect(
        client.query(
          `INSERT INTO users (auth_subject, email)
           VALUES ($1, $2)`,
          [`different-subject-${userId}`, `PROOFSTACK-${userId}@example.test`],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT unique_user");
      await client.query("RELEASE SAVEPOINT unique_user");

      await client.query("SAVEPOINT unique_member");
      await expect(
        client.query(
          `INSERT INTO organization_members (organization_id, user_id, role_id)
           VALUES ($1, $2, $3)`,
          [organizationId, userId, roleId],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT unique_member");
      await client.query("RELEASE SAVEPOINT unique_member");

      await client.query("SAVEPOINT unique_role_permission");
      await expect(
        client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2)`,
          [roleId, permissionId],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT unique_role_permission");
      await client.query("RELEASE SAVEPOINT unique_role_permission");

      const mapping = await client.query(
        `SELECT roles.key AS role_key, permissions.key AS permission_key
         FROM role_permissions
         JOIN roles ON roles.id = role_permissions.role_id
         JOIN permissions ON permissions.id = role_permissions.permission_id
         WHERE roles.id = $1 AND permissions.id = $2`,
        [roleId, permissionId],
      );
      expect(mapping.rows).toEqual([
        {
          role_key: `fixture-role-${roleId}`,
          permission_key: `fixture-permission-${permissionId}`,
        },
      ]);

      const audit = await client.query(
        `INSERT INTO audit_logs
           (organization_id, actor_user_id, action, resource_type, resource_id, request_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING id, organization_id, actor_user_id, request_id, metadata, created_at`,
        [
          organizationId,
          userId,
          "integration.created",
          "fixture",
          organizationId,
          requestId,
          JSON.stringify({ source: "integration-test" }),
        ],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        organization_id: organizationId,
        actor_user_id: userId,
        request_id: requestId,
        metadata: { source: "integration-test" },
      });
      expect(audit.rows[0].created_at).toBeInstanceOf(Date);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }

    const rolledBackAudit = await pool.query(
      "SELECT id FROM audit_logs WHERE request_id = $1",
      [requestId],
    );
    expect(rolledBackAudit.rows).toHaveLength(0);
  });
});
