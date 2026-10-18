# Durable Supabase Storage design

## Current flow and provider assumptions

`requestUpload` currently obtains a Replit-signed Google PUT URL before it
opens the SQL transaction. Completion reads provider metadata, pins the Google
generation, copies to a newly-created ready key, writes provider ACL metadata,
then updates SQL. Cleanup later deletes the captured Google key with
`ifGenerationMatch`. These assumptions do not map directly to Supabase Storage.

The durable design treats PostgreSQL as the lifecycle authority and Supabase as
an immutable byte store. The browser receives only a short-lived upload token;
the service-role key remains in the API and worker processes.

## Backward-compatible schema batch

Add `asset_upload_attempts` without changing or deleting existing
`community_assets` rows. It contains:

- `id`, `asset_id`, `user_id`, `provider`, `bucket`, `quarantine_key`, and
  `ready_key`, all immutable after insert.
- `expected_size`, `content_type`, `expires_at`, `state`, `fence_token`, and
  `verification_digest`.
- state timestamps and a bounded error code, with unique asset and object-key
  constraints.

Add nullable provider identity columns to `community_assets` for new rows
(`storage_provider`, `storage_bucket`, `storage_key`, `lifecycle_version`).
Existing `object_path` continues to serve old records until an explicitly
reviewed backfill is complete. Add `asset_lifecycle_jobs` for promotion,
abandonment, and reconciliation; retain `asset_cleanup_jobs` for legacy
captured targets until all old assets are retired.

## Batch 2 decisions

New-provider work uses one typed lifecycle outbox (`promotion`, `reconcile`,
or `cleanup`). Legacy `asset_cleanup_jobs` remains the sole cleanup mechanism
for Google/Replit objects. Immutable new-provider identities live in a durable
identity/tombstone table keyed by `(provider, bucket, object_key)`; identities
are never reused after deletion. Job ownership is controlled by database
lease/fence CAS operations, while immutable non-overwritten keys prevent a
stale already-authorized worker from targeting a newer object.

## State machine

1. In one transaction, lock the account quota, reserve bytes, create a pending
   asset and immutable quarantine/ready keys, then commit.
2. Ask Supabase for a signed upload URL for exactly that quarantine key. If
   signing fails, mark the attempt failed; no untracked key is issued.
3. Completion locks the attempt, checks expiry and fence token, downloads the
   full object through the server, enforces byte and decoder limits, strips
   metadata, and writes canonical output to the immutable ready key.
4. The same transaction records verification and makes the asset ready. A
   crash after byte writes leaves a durable promotion/reconciliation job; it
   cannot make an asset ready without SQL.
5. Deletion records a tombstone and a captured object identity before external
   I/O. A worker owns a database lease and may delete only the exact immutable
   key associated with its current fence token. It never deletes by prefix or
   current configuration.

Supabase Storage does not provide the current Google numeric-generation
contract. Keys are write-once: uploads use a new UUID key with `upsert: false`,
promotion uses another new UUID key with `upsert: false`, and no ready key is
ever overwritten. The database lease/fence token controls worker ownership; a
stale worker can at worst remove its immutable tombstoned key, never a newer
object. The worker acknowledges only if its lease CAS succeeds.

## Adapter boundary

`AssetStorage` should expose `createUpload`, `inspect`, `download`,
`writeCanonical`, `removeImmutable`, and `streamRead`. It returns provider
opaque identity/etag as diagnostic metadata only; correctness depends on the
persisted immutable key and database fence, not an assumed Supabase version
precondition. Authorization remains in API/PostgreSQL and every bucket is
private.

## Required provider acceptance

This design does not close the storage gate. A disposable Supabase project must
prove private anonymous denial, signed-upload expiry, no-overwrite behavior,
timeout/retry semantics, cleanup after worker crash, and reconciliation after
API restart. Image decoding and canonical re-encoding require a separately
bounded worker/runtime; signature tests alone are insufficient.
