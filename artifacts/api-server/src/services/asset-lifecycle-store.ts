import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type StorageIdentity = {
  provider: string;
  bucket: string;
  objectKey: string;
};

export type LifecycleKind = "promotion" | "reconcile" | "cleanup";

const safeIdentity = (identity: StorageIdentity) =>
  /^[a-z][a-z0-9_-]{1,31}$/.test(identity.provider) &&
  /^[a-z0-9][a-z0-9._-]*$/.test(identity.bucket) &&
  /^[A-Za-z0-9._/-]+$/.test(identity.objectKey) &&
  !/(^|\/)\.{1,2}(\/|$)/.test(identity.objectKey);

/**
 * Reserves immutable object identities before a future provider upload URL is
 * requested. Callers must commit before performing any provider I/O.
 */
export async function reserveLifecycleUpload(
  db: PoolClient,
  input: {
    assetId: string;
    userId: string;
    quarantine: StorageIdentity;
    ready: StorageIdentity;
    expectedSize: number;
    contentType: string;
    expiresAt: Date;
  },
) {
  if (
    !safeIdentity(input.quarantine) ||
    !safeIdentity(input.ready) ||
    input.expectedSize < 0 ||
    input.quarantine.provider !== input.ready.provider ||
    input.quarantine.bucket !== input.ready.bucket ||
    input.quarantine.objectKey === input.ready.objectKey
  )
    throw new Error("INVALID_ASSET_LIFECYCLE_RESERVATION");

  const reserve = async (identity: StorageIdentity) => {
    const result = await db.query(
      `INSERT INTO asset_storage_objects(provider,bucket,object_key,state)
       VALUES($1,$2,$3,'pending') RETURNING id`,
      [identity.provider, identity.bucket, identity.objectKey],
    );
    return result.rows[0].id as string;
  };
  const quarantineId = await reserve(input.quarantine);
  const readyId = await reserve(input.ready);
  const result = await db.query(
    `INSERT INTO asset_upload_attempts(asset_id,user_id,object_id,ready_object_id,expected_size,content_type,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,fence_token`,
    [
      input.assetId,
      input.userId,
      quarantineId,
      readyId,
      input.expectedSize,
      input.contentType,
      input.expiresAt,
    ],
  );
  return result.rows[0] as { id: string; fence_token: number };
}

export async function enqueueLifecycleJob(
  db: PoolClient,
  input: {
    objectId: string;
    attemptId?: string;
    kind: LifecycleKind;
    idempotencyKey: string;
  },
) {
  const result = await db.query(
    `INSERT INTO asset_lifecycle_jobs(object_id,attempt_id,kind,idempotency_key)
     VALUES($1,$2,$3,$4) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`,
    [input.objectId, input.attemptId || null, input.kind, input.idempotencyKey],
  );
  return (result.rows[0]?.id as string | undefined) ?? null;
}

export async function claimLifecycleJob(db: PoolClient) {
  const leaseToken = randomUUID();
  const result = await db.query(
    `UPDATE asset_lifecycle_jobs SET state='leased',attempts=attempts+1,
       fence_token=fence_token+1,lease_token=$1,leased_until=now()+interval '5 minutes'
     WHERE id=(SELECT id FROM asset_lifecycle_jobs WHERE state='pending' AND available_at<=now()
       ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING *`,
    [leaseToken],
  );
  return result.rows[0] ?? null;
}

export async function completeLifecycleJob(
  db: PoolClient,
  input: { id: string; leaseToken: string; fenceToken: number },
) {
  const result = await db.query(
    `UPDATE asset_lifecycle_jobs SET state='complete',completed_at=now(),lease_token=NULL,leased_until=NULL
     WHERE id=$1 AND state='leased' AND lease_token=$2 AND fence_token=$3 AND leased_until>now()
     RETURNING id`,
    [input.id, input.leaseToken, input.fenceToken],
  );
  return !!result.rows[0];
}
