import { pool } from "@workspace/db";

let nextCleanup = 0;
export async function cleanupAuthState() {
  if (Date.now() < nextCleanup) return;
  nextCleanup = Date.now() + 60000;
  try {
    await pool.query("DELETE FROM auth_flows WHERE expires_at<=now()");
    await pool.query(
      "DELETE FROM auth_hook_receipts WHERE accepted_at<now()-interval '1 day'",
    );
    await pool.query(
      "DELETE FROM auth_failures WHERE window_started_at<now()-interval '1 day' AND (locked_until IS NULL OR locked_until<now())",
    );
    await pool.query(`UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()),encrypted_credentials=NULL
      WHERE encrypted_credentials IS NOT NULL AND (revoked_at IS NOT NULL OR expires_at<=now() OR last_seen_at<now()-interval '30 minutes')`);
    if (Date.now() >= nextRetention) {
      nextRetention = Date.now() + 3600000;
      await applyRetention();
    }
  } catch (error) {
    nextCleanup = 0;
    throw error;
  }
}
let nextRetention = 0;
// Retention periods stated in the Privacy Policy. Ended sessions and security
// logs are kept 180 days (IT Rules 2021, CERT-In directions); registration
// details of deleted accounts are erased once their 180 days have passed.
export async function applyRetention() {
  await pool.query("DELETE FROM deleted_accounts WHERE purge_after<=now()");
  await pool.query(
    "DELETE FROM sessions WHERE COALESCE(revoked_at,expires_at)<now()-interval '180 days'",
  );
  await pool.query(
    "DELETE FROM notifications WHERE created_at<now()-interval '365 days'",
  );
  await pool.query(
    "DELETE FROM audit_logs WHERE created_at<now()-interval '365 days'",
  );
}
