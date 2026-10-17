import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

export type CleanupTarget = {
  bucket: string;
  namespace: string;
  object_name: string;
  object_path: string;
};
export type CleanupStorage = {
  // null means confirmed not found; other errors must fail/retry, never succeed.
  inspect(target: CleanupTarget): Promise<string | null>;
  remove(target: CleanupTarget, generation: string): Promise<void>;
};

export async function runAssetCleanupOnce(
  boundary: CleanupStorage,
): Promise<boolean> {
  await pool.query(
    `UPDATE asset_cleanup_jobs SET state=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,
     lease_token=NULL,leased_until=NULL,last_error='LEASE_EXPIRED'
     WHERE state='leased' AND leased_until<=now()`,
  );
  const token = randomUUID();
  const job = (
    await pool.query(
      `UPDATE asset_cleanup_jobs SET state='leased',attempts=attempts+1,lease_token=$1,leased_until=now()+interval '5 minutes'
     WHERE id=(SELECT id FROM asset_cleanup_jobs WHERE state='pending' AND available_at<=now() AND attempts<8
       ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      [token],
    )
  ).rows[0];
  if (!job) return false;
  try {
    const current = await boundary.inspect(job);
    if (current !== null) {
      if (
        !/^[1-9][0-9]{0,29}$/.test(current) ||
        (job.generation !== null && current !== job.generation)
      )
        throw new Error("Generation changed");
      // Persist the storage generation before the first delete. Lease-token CAS
      // stops an expired/reclaimed worker from starting new destructive work.
      const pinned = await pool.query(
        `UPDATE asset_cleanup_jobs SET generation=coalesce(generation,$3)
         WHERE id=$1 AND state='leased' AND lease_token=$2 AND leased_until>now() RETURNING id`,
        [job.id, token, current],
      );
      if (!pinned.rows[0]) return true;
      await boundary.remove(job, current);
    }
    // Keep acknowledgement and quota release atomic, without importing the
    // HTTP/auth-session module (a worker has no PORT/cookie/provider config).
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const done = await db.query(
        `UPDATE asset_cleanup_jobs SET state='complete',completed_at=now(),lease_token=NULL,leased_until=NULL,last_error=NULL
         WHERE id=$1 AND state='leased' AND lease_token=$2 AND leased_until>now() RETURNING asset_id,object_path`,
        [job.id, token],
      );
      if (done.rows[0])
        await db.query(
          "DELETE FROM community_assets WHERE id=$1 AND status='deleting' AND object_path=$2",
          [job.asset_id, job.object_path],
        );
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  } catch {
    // Never persist provider error text: it can contain credentials/object URLs.
    await pool.query(
      `UPDATE asset_cleanup_jobs SET state=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,
       available_at=now()+interval '30 seconds'*power(2,attempts-1),last_error='STORAGE_CLEANUP_FAILED',lease_token=NULL,leased_until=NULL
       WHERE id=$1 AND state='leased' AND lease_token=$2 AND leased_until>now()`,
      [job.id, token],
    );
  }
  return true;
}
