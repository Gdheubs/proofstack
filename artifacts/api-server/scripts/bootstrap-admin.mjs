import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { randomUUID } from "node:crypto";

if (process.env.NODE_ENV !== "development")
  throw new Error(
    "Development-only bootstrap. No production changes are permitted",
  );
const [userId, confirm] = process.argv.slice(2).filter((arg) => arg !== "--");
if (
  !/^[0-9a-f-]{36}$/i.test(userId || "") ||
  confirm !== "--confirm-first-super-admin"
) {
  throw new Error(
    "Supply the existing application account UUID and --confirm-first-super-admin",
  );
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tx = await pool.connect();
try {
  await tx.query("BEGIN");
  await tx.query(
    "SELECT pg_advisory_xact_lock(hashtext('proofstack-platform-management'))",
  );
  const existing = await tx.query(
    "SELECT id FROM users WHERE platform_role='super_admin' LIMIT 1",
  );
  if (existing.rowCount)
    throw new Error(
      "A Super Admin already exists; use authenticated account management",
    );
  const user = await tx.query(
    "SELECT id,auth_subject FROM users WHERE id=$1 AND status='active' FOR UPDATE",
    [userId],
  );
  if (!user.rows[0])
    throw new Error("An existing active application account is required");
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const verified = await client.auth.admin.getUserById(
    user.rows[0].auth_subject,
  );
  if (
    verified.error ||
    !(
      verified.data.user?.email_confirmed_at ||
      verified.data.user?.phone_confirmed_at
    ) ||
    !verified.data.user?.factors?.some(
      (f) =>
        f.status === "verified" && ["totp", "phone"].includes(f.factor_type),
    )
  ) {
    throw new Error(
      "Enroll and verify MFA on this account before granting platform access",
    );
  }
  await tx.query(
    "UPDATE users SET platform_role='super_admin',updated_at=now() WHERE id=$1",
    [userId],
  );
  await tx.query(
    "UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL WHERE user_id=$1",
    [userId],
  );
  await tx.query(
    `INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
    VALUES($1::uuid,'account.super_admin_bootstrapped','account',$1::text,$2::uuid,'{\"reason\":\"operator_bootstrap\"}'::jsonb)`,
    [userId, randomUUID()],
  );
  await tx.query("COMMIT");
  console.log("First Super Admin granted. Sign in again and complete MFA.");
} catch {
  await tx.query("ROLLBACK");
  console.error(
    "Bootstrap failed. Ensure the account is active, has verified MFA, and no Super Admin exists.",
  );
  process.exitCode = 1;
} finally {
  tx.release();
  await pool.end();
}
