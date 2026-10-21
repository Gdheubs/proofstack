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
import { pool } from "@workspace/db";
import { organizationRole } from "../artifacts/api-server/src/services/auth-account";
import { organizationAction } from "../artifacts/api-server/src/services/community-org-actions";
import {
  transaction,
  type AuthSession,
} from "../artifacts/api-server/src/services/auth-sessions";

// Only the live provider lookup is replaced; policy, transactions and SQL are real.
const provider = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock(
  "../artifacts/api-server/src/services/auth-provider",
  async (original) => ({
    ...(await original<
      typeof import("../artifacts/api-server/src/services/auth-provider")
    >()),
    adminClient: () => ({ auth: { admin: { getUserById: provider.lookup } } }),
  }),
);

type Role = "organization_owner" | "organization_admin";
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Organization role policy parity",
  () => {
    let org: string,
      owner: string,
      target: string,
      subject: string,
      handle: string;
    let session: AuthSession;
    let users: string[];
    beforeEach(async () => {
      org = randomUUID();
      owner = randomUUID();
      target = randomUUID();
      subject = randomUUID();
      handle = `role-${target.slice(0, 8)}`;
      users = [owner, target];
      provider.lookup.mockReset();
      provider.lookup.mockResolvedValue({
        data: {
          user: {
            id: subject,
            factors: [{ status: "verified", factor_type: "totp" }],
          },
        },
        error: null,
      });
      await pool.query(
        "INSERT INTO users(id,auth_subject,email) VALUES($1,$2,$3),($4,$5,$6)",
        [
          owner,
          owner,
          `${owner}@example.test`,
          target,
          subject,
          `${target}@example.test`,
        ],
      );
      await pool.query(
        "INSERT INTO profiles(user_id,display_name,handle) VALUES($1,'Owner',$2),($3,'Target',$4)",
        [owner, `role-${owner.slice(0, 8)}`, target, handle],
      );
      await pool.query(
        "INSERT INTO organizations(id,name,slug) VALUES($1,'Role policy fixture',$2)",
        [org, org],
      );
      await pool.query(
        "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key='organization_owner'",
        [org, owner],
      );
      await pool.query(
        "INSERT INTO sessions(user_id,provider_session_id,expires_at,encrypted_credentials) VALUES($1,$2,now()+interval '1 hour','fixture-credentials'),($1,$3,now()+interval '1 hour','fixture-credentials')",
        [target, randomUUID(), randomUUID()],
      );
      session = {
        user: { id: owner, platformRole: null },
        aal: "aal2",
        row: { last_mfa_at: new Date() },
        providerUser: {
          factors: [{ status: "verified", factor_type: "totp" }],
        },
      } as AuthSession;
    });
    afterEach(async () => {
      await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
    });
    afterAll(async () => {
      await pool.end();
    });
    // Existing members change role; the community path invites non-members.
    const join = (role: string) =>
      pool.query(
        "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key=$3",
        [org, target, role],
      );
    const targetRole = async () =>
      (
        await pool.query(
          "SELECT r.key FROM organization_members m JOIN roles r ON r.id=m.role_id WHERE m.organization_id=$1 AND m.user_id=$2",
          [org, target],
        )
      ).rows[0]?.key ?? null;
    const grant = (path: "legacy" | "community", role: Role) =>
      path === "legacy"
        ? organizationRole(
            { id: randomUUID() } as Parameters<typeof organizationRole>[0],
            session,
            org,
            target,
            role,
          )
        : transaction((db) =>
            organizationAction(db, session, {
              action: "member-save",
              organizationId: org,
              handle,
              role,
            }),
          );

    for (const path of ["legacy", "community"] as const) {
      it(`${path} preserves sessions on a same-role update`, async () => {
        await pool.query(
          "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key='organization_admin'",
          [org, target],
        );
        await grant(path, "organization_admin");
        expect(
          (
            await pool.query(
              "SELECT id FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND encrypted_credentials IS NOT NULL",
              [target],
            )
          ).rows,
        ).toHaveLength(2);
      });
      it(`${path} rolls back privileges when the identity provider lookup fails`, async () => {
        if (path === "legacy") await join("organization_member");
        provider.lookup.mockRejectedValue(
          new Error("test-only identity transport unavailable"),
        );
        await expect(grant(path, "organization_admin")).rejects.toThrow(
          "test-only identity transport unavailable",
        );
        expect(await targetRole()).toBe(
          path === "legacy" ? "organization_member" : null,
        );
        expect(
          (
            await pool.query(
              "SELECT id FROM organization_invitations WHERE organization_id=$1",
              [org],
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await pool.query(
              "SELECT id FROM sessions WHERE user_id=$1 AND revoked_at IS NULL",
              [target],
            )
          ).rows,
        ).toHaveLength(2);
      });
      it(`${path} denies an owner whose membership-management grant was revoked`, async () => {
        const removed = await pool.query(
          "DELETE FROM role_permissions WHERE role_id=(SELECT id FROM roles WHERE key='organization_owner') AND permission_id=(SELECT id FROM permissions WHERE key='community.organization.members') RETURNING role_id,permission_id",
        );
        try {
          await expect(grant(path, "organization_admin")).rejects.toMatchObject(
            { status: 403 },
          );
        } finally {
          for (const row of removed.rows)
            await pool.query(
              "INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
              [row.role_id, row.permission_id],
            );
        }
      });
      it(`${path} enforces the 500-active-member limit on new privileged grants`, async () => {
        const extra = Array.from({ length: 499 }, () => randomUUID());
        users.push(...extra);
        await pool.query(
          "INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) ids(id)",
          [extra],
        );
        await pool.query(
          "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,uid,r.id FROM unnest($2::uuid[]) ids(uid) CROSS JOIN roles r WHERE r.key='organization_member'",
          [org, extra],
        );
        // Membership requires an accepted invitation; the limit applies there.
        await expect(grant(path, "organization_admin")).rejects.toMatchObject({
          status: 409,
          code: path === "legacy" ? "INVITATION_REQUIRED" : "MEMBER_LIMIT",
        });
      });
      it(`${path} revokes target sessions when a role is lowered`, async () => {
        await join("organization_owner");
        await grant(path, "organization_admin");
        expect(await targetRole()).toBe("organization_admin");
        expect(
          (
            await pool.query(
              "SELECT * FROM sessions WHERE user_id=$1 AND (revoked_at IS NULL OR encrypted_credentials IS NOT NULL)",
              [target],
            )
          ).rows,
        ).toHaveLength(0);
      });
      it(`${path} keeps target sessions when a role is raised`, async () => {
        await join("organization_member");
        await grant(path, "organization_admin");
        expect(await targetRole()).toBe("organization_admin");
        expect(
          (
            await pool.query(
              "SELECT id FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND encrypted_credentials IS NOT NULL",
              [target],
            )
          ).rows,
        ).toHaveLength(2);
      });
      it(`${path} never adds a non-member without their acceptance`, async () => {
        if (path === "legacy")
          await expect(grant(path, "organization_admin")).rejects.toMatchObject(
            { status: 409, code: "INVITATION_REQUIRED" },
          );
        else await grant(path, "organization_admin");
        expect(await targetRole()).toBeNull();
        expect(
          (
            await pool.query(
              "SELECT id FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND encrypted_credentials IS NOT NULL",
              [target],
            )
          ).rows,
        ).toHaveLength(2);
      });
      it(`${path} does not count disabled owners when protecting the final active owner`, async () => {
        await pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
          target,
        ]);
        await pool.query(
          "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key='organization_owner'",
          [org, target],
        );
        const demote =
          path === "legacy"
            ? organizationRole(
                { id: randomUUID() } as Parameters<typeof organizationRole>[0],
                session,
                org,
                owner,
                "organization_admin",
              )
            : transaction((db) =>
                organizationAction(db, session, {
                  action: "member-save",
                  organizationId: org,
                  handle: `role-${owner.slice(0, 8)}`,
                  role: "organization_admin",
                }),
              );
        await expect(demote).rejects.toMatchObject({
          status: 409,
          code:
            path === "legacy"
              ? "LAST_OWNER_PROTECTED"
              : "LAST_ORGANIZATION_OWNER",
        });
      });
      for (const role of [
        "organization_owner",
        "organization_admin",
      ] as const) {
        it.each([
          ["absent", []],
          ["unverified", [{ status: "unverified", factor_type: "totp" }]],
          ["unsupported", [{ status: "verified", factor_type: "webauthn" }]],
        ])(
          `${path} rejects ${role} grants with %s native MFA`,
          async (_name, factors) => {
            if (path === "legacy") await join("organization_member");
            provider.lookup.mockResolvedValue({
              data: { user: { id: subject, factors } },
              error: null,
            });
            await expect(grant(path, role)).rejects.toMatchObject({
              status: 409,
              code: "TARGET_MFA_REQUIRED",
            });
            expect(provider.lookup).toHaveBeenCalledWith(subject);
            expect(await targetRole()).toBe(
              path === "legacy" ? "organization_member" : null,
            );
            expect(
              (
                await pool.query(
                  "SELECT * FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND encrypted_credentials IS NOT NULL",
                  [target],
                )
              ).rows,
            ).toHaveLength(2);
            expect(
              (
                await pool.query(
                  "SELECT * FROM audit_logs WHERE organization_id=$1",
                  [org],
                )
              ).rows,
            ).toHaveLength(0);
            expect(
              (
                await pool.query(
                  "SELECT * FROM notifications WHERE user_id=$1",
                  [target],
                )
              ).rows,
            ).toHaveLength(0);
          },
        );
      }
    }
  },
);
