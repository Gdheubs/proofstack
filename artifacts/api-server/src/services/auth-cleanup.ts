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
  } catch (error) {
    nextCleanup = 0;
    throw error;
  }
}
