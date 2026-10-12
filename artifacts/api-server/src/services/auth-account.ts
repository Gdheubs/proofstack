import { pool } from "@workspace/db";
import type { Request } from "express";
import { ApiError } from "../lib/errors";
import {
  requireFresh,
  factors,
  transaction,
  audit,
  type AccountUser,
  type AuthSession,
} from "./auth-sessions";
import {
  assertPlatformManagement,
  assertLastOwner,
  assertLastSuperAdmin,
} from "./auth-policy";

export async function getAccount(session: AuthSession) {
  const uid = session.user.id;
  const [sessions, memberships, activity, codes] = await Promise.all([
    pool.query(
      `SELECT id,device_label AS "deviceLabel",created_at AS "createdAt",last_seen_at AS "lastSeenAt",expires_at AS "expiresAt",
      id=$2 AS current FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()
      AND last_seen_at>now()-interval '30 minutes' ORDER BY created_at DESC LIMIT 100`,
      [uid, session.row.id],
    ),
    pool.query(
      `SELECT o.id AS "organizationId",o.name,o.slug,r.key AS role FROM organization_members m
      JOIN organizations o ON o.id=m.organization_id JOIN roles r ON r.id=m.role_id
      WHERE m.user_id=$1 AND m.status='active' ORDER BY o.name LIMIT 50`,
      [uid],
    ),
    pool.query(
      `SELECT id,action,created_at AS "createdAt" FROM audit_logs
      WHERE actor_user_id=$1 AND (action LIKE 'auth.%' OR action LIKE 'account.%')
      ORDER BY created_at DESC LIMIT 50`,
      [uid],
    ),
    pool.query(
      "SELECT count(*)::int AS remaining FROM auth_recovery_codes WHERE user_id=$1 AND used_at IS NULL",
      [uid],
    ),
  ]);
  const members = memberships.rows.length
    ? await pool.query(
        `SELECT requested.org_id,m.* FROM unnest($1::uuid[]) requested(org_id) CROSS JOIN LATERAL (
       SELECT m.user_id AS "userId",p.display_name AS "displayName",r.key AS role FROM organization_members m
       JOIN profiles p ON p.user_id=m.user_id JOIN roles r ON r.id=m.role_id JOIN users u ON u.id=m.user_id AND u.status='active'
       WHERE m.organization_id=requested.org_id AND m.status='active' ORDER BY p.display_name,m.user_id LIMIT 100) m`,
        [memberships.rows.map((o) => o.organizationId)],
      )
    : { rows: [] };
  const orgs = memberships.rows.map((org) => ({
    ...org,
    members: members.rows
      .filter((m) => m.org_id === org.organizationId)
      .map(({ org_id: _orgId, ...m }) => m),
  }));
  return {
    user: session.user,
    sessions: sessions.rows,
    memberships: orgs,
    activity: activity.rows,
    factors: factors(session.providerUser),
    recoveryCodesRemaining: codes.rows[0].remaining,
    passwordRecovery: session.row.password_recovery,
  };
}
export async function listUsers(session: AuthSession) {
  if (!session.user.platformRole)
    throw new ApiError(
      403,
      "PERMISSION_DENIED",
      "Platform account management is restricted",
    );
  requireFresh(session, true);
  const { rows } =
    await pool.query(`SELECT u.id,u.email,u.phone,u.platform_role AS "platformRole",u.status,
    u.email_verified_at IS NOT NULL AS "emailVerified",u.phone_verified_at IS NOT NULL AS "phoneVerified",
    u.mfa_recovery_required AS "mfaRecoveryRequired",p.display_name AS "displayName",p.kind
    FROM users u JOIN profiles p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT 100`);
  return rows;
}
export async function manageUser(
  req: Request,
  session: AuthSession,
  userId: string,
  change: {
    role?: "moderator" | "admin" | "super_admin" | null;
    status?: "active" | "disabled";
  },
) {
  requireFresh(session, true);
  await transaction(async (tx) => {
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtext('proofstack-platform-management'))",
    );
    const actor = await tx.query(
      `SELECT u.id,u.platform_role AS "platformRole",u.status FROM users u JOIN sessions s ON s.user_id=u.id
      WHERE u.id=$1 AND s.id=$2 AND u.status='active' AND s.revoked_at IS NULL AND s.expires_at>now() FOR UPDATE OF u,s`,
      [session.user.id, session.row.id],
    );
    if (!actor.rows[0])
      throw new ApiError(
        401,
        "SESSION_REVOKED",
        "Sign in again before managing accounts",
      );
    const result = await tx.query(
      `SELECT id,platform_role AS "platformRole",status FROM users WHERE id=$1 FOR UPDATE`,
      [userId],
    );
    if (!result.rows[0])
      throw new ApiError(404, "USER_NOT_FOUND", "The account was not found");
    const target = result.rows[0] as AccountUser;
    assertPlatformManagement(actor.rows[0] as AccountUser, target, change.role);
    const count = await tx.query(
      "SELECT count(*)::int AS n FROM users WHERE platform_role='super_admin' AND status='active'",
    );
    assertLastSuperAdmin(
      target,
      (change.role !== undefined && change.role !== "super_admin") ||
        change.status === "disabled",
      count.rows[0].n,
    );
    if (change.role !== undefined)
      await tx.query(
        "UPDATE users SET platform_role=$2,updated_at=now() WHERE id=$1",
        [userId, change.role],
      );
    if (change.status)
      await tx.query(
        "UPDATE users SET status=$2,updated_at=now() WHERE id=$1",
        [userId, change.status],
      );
    await tx.query(
      "UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL WHERE user_id=$1",
      [userId],
    );
    await audit(
      req,
      change.role !== undefined
        ? "account.platform_role_changed"
        : "account.status_changed",
      session.user.id,
      userId,
      { role: change.role ?? null, status: change.status ?? target.status },
      tx,
    );
  });
}
export async function ensureOrganizationRoles() {
  // System definitions only. This never creates users or privileged assignments.
  await pool.query(`INSERT INTO roles(key,name) VALUES('organization_owner','Organization Owner'),('organization_admin','Organization Admin')
    ON CONFLICT(key) DO NOTHING`);
}
export async function createOrganization(
  req: Request,
  session: AuthSession,
  name: string,
  slug: string,
) {
  requireFresh(session, true);
  await ensureOrganizationRoles();
  await transaction(async (tx) => {
    const created = await tx.query(
      "INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id",
      [name, slug],
    );
    await tx.query(
      `INSERT INTO organization_members(organization_id,user_id,role_id)
      SELECT $1,$2,id FROM roles WHERE key='organization_owner'`,
      [created.rows[0].id, session.user.id],
    );
    await audit(
      req,
      "account.organization_created",
      session.user.id,
      created.rows[0].id,
      {},
      tx,
    );
  });
}
export async function organizationRole(
  req: Request,
  session: AuthSession,
  organizationId: string,
  userId: string,
  role: "organization_owner" | "organization_admin",
) {
  requireFresh(session, true);
  await ensureOrganizationRoles();
  await transaction(async (tx) => {
    const org = await tx.query(
      "SELECT id FROM organizations WHERE id=$1 FOR UPDATE",
      [organizationId],
    );
    if (!org.rows[0])
      throw new ApiError(
        404,
        "ORGANIZATION_NOT_FOUND",
        "The organization was not found",
      );
    const actor = await tx.query(
      `SELECT r.key FROM organization_members m JOIN roles r ON r.id=m.role_id
      WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active'`,
      [organizationId, session.user.id],
    );
    if (
      actor.rows[0]?.key !== "organization_owner" &&
      session.user.platformRole !== "super_admin"
    ) {
      throw new ApiError(
        403,
        "PERMISSION_DENIED",
        "Only an organization owner can manage these roles",
      );
    }
    const member = await tx.query(
      `SELECT r.key FROM organization_members m JOIN roles r ON r.id=m.role_id
      WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active'`,
      [organizationId, userId],
    );
    const owners = await tx.query(
      `SELECT count(*)::int AS n FROM organization_members m JOIN roles r ON r.id=m.role_id
      WHERE m.organization_id=$1 AND m.status='active' AND r.key='organization_owner'`,
      [organizationId],
    );
    assertLastOwner(member.rows[0]?.key || "", role, owners.rows[0].n);
    const target = await tx.query(
      "SELECT id FROM users WHERE id=$1 AND status='active'",
      [userId],
    );
    if (!target.rows[0])
      throw new ApiError(
        404,
        "USER_NOT_FOUND",
        "An active existing ProofStack account is required",
      );
    await tx.query(
      `INSERT INTO organization_members(organization_id,user_id,role_id)
      SELECT $1,$2,id FROM roles WHERE key=$3 ON CONFLICT(organization_id,user_id)
      DO UPDATE SET role_id=EXCLUDED.role_id,status='active',updated_at=now()`,
      [organizationId, userId, role],
    );
    await writeMembershipAudit(
      req,
      session.user.id,
      organizationId,
      userId,
      role,
      tx,
    );
    await tx.query(
      "INSERT INTO notifications(user_id,organization_id,title,body) VALUES($1,$2,$3,$4)",
      [
        userId,
        organizationId,
        "Organization access updated",
        `Your organization role is now ${role.replaceAll("_", " ")}.`,
      ],
    );
  });
}
async function writeMembershipAudit(
  req: Request,
  actor: string,
  org: string,
  target: string,
  role: string,
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
) {
  const { writeAuditEvent } = await import("./audit");
  await writeAuditEvent(
    {
      action: "account.organization_role_changed",
      actorUserId: actor,
      organizationId: org,
      resourceType: "membership",
      resourceId: target,
      requestId: String(req.id),
      metadata: { role },
    },
    (sql, values) => tx.query(sql, values),
  );
}
