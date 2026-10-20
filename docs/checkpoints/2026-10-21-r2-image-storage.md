# Cloudflare R2 image storage — October 21, 2026

Parent: `f6bf3e7` (trusted client address). Hosted [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39500556157) and [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39500556150) passed on `f6bf3e7`.

## Scope

Replace the Replit-sidecar Google Cloud Storage adapter, which cannot run on Render, with Cloudflare R2 through its S3-compatible API, as approved for the launch plan. Supabase Storage (the earlier design document) was not used.

## Design decision: API-side ingest instead of presigned PUT

The page CSP is `connect-src 'self'`, so a browser PUT to any storage host was already blocked, and presigned URLs only constrain what the provider chooses to enforce. Uploads now go to the same-origin API:

1. `POST /api/community/uploads` (unchanged contract) validates metadata, locks the account quota and inserts a `pending` asset whose `object_path` is a freshly reserved `/objects/ready/<uuid>` key. No storage I/O. `uploadUrl` is now `/api/community/assets/<id>/content`.
2. `PUT /api/community/assets/:id/content` checks the id, CSRF, session and a per-user limit (30/hour) **before** the body is read; refuses a declared `Content-Length` over 8 MiB unread; `express.raw` caps streamed bodies at 8 MiB and accepts only PNG/JPEG/WebP, uncompressed. Under the asset row lock it requires owner, `pending`, under one hour old, exact declared size and type, and a valid signature; then writes once to the reserved R2 key, marks the asset `ready` and audits `community.asset-upload`.
3. `asset-complete` confirms a ready image and returns `409 UPLOAD_CONTENT_REQUIRED` for pending ones. The frontend hook sends the CSRF header and shows the API's error message.
4. `GET /api/community/assets/:id` keeps SQL authorization and streams the private object from R2.

There is no quarantine copy or promotion step, and no bucket CORS rule or public bucket access is required.

## Changes

- `lib/objectStorage.ts`: R2 adapter (`locate`, `put`, `read`, `inspect`, `remove`), lazy path-style client (`region auto`, 5 s connect / 30 s request timeouts, optional SDK checksums disabled), `r2Settings` validation that never echoes values. `lib/objectAcl.ts` removed (authorization is SQL-only).
- `services/community-assets.ts`, `routes/community.ts`, `hooks/use-community.ts`: flow above.
- Cleanup worker: `asset-cleanup-storage.ts` targets only the captured key and the allowlisted namespace; `STORAGE_VERSION` (numeric generation or R2/S3 ETag) is shared from `asset-cleanup-runtime.ts`; worker startup now also requires valid R2 settings. R2 delete preconditions are not relied on: keys are written once and never reused, and the pinned version is compared before delete.
- Migration `0013_r2_storage_versions` (drizzle-kit generated; only drops and re-adds `asset_cleanup_generation_check` to accept ETags) and schema/snapshot.
- Preflight check `R2 object storage credentials`; `.env.example`, `render.yaml`, `README.md`, `docs/setup.md`, `docs/deployment.md` (R2 bucket section), `docs/community.md`, `docs/production-plan.md`, risk register S-01/S-03 source updates.
- Dependencies: removed `@google-cloud/storage`; added `@aws-sdk/client-s3@3.1147.0` (published 2026-10-06). Its transitive `@aws-sdk/*` packages resolved to releases from 2026-10-09 to 2026-10-19. That meets the repository's `minimumReleaseAge: 1440` (one day) but not a two-week bar; a stricter workspace-wide policy rejected existing lockfile entries, and time-based resolution re-resolved unrelated packages, so neither was applied. `pnpm audit --audit-level moderate`: no known vulnerabilities.

## Validation (local)

- New/rewritten tests: `asset-upload-route` (8: CSRF before body using a headers-only request, malformed id, exact byte hand-off, unread 413, 415 for text/SVG/JSON, gzip refused), `community-assets` (reservation without storage I/O, write-then-ready with audit, five invalid-body cases, four state refusals, failed write leaves pending, 503 without credentials, completion/deletion), `asset-cleanup-storage` (target validation, version validation, confirmed-404-only absence, captured key after namespace rotation, multipart ETags), `object-storage-config` (key mapping, settings validation, client configuration), `asset-upload-availability`, `asset-cleanup-runtime`, `preflight-checks`, `asset-cleanup-metadata` (latest snapshot matches the schema; `0013` changes only the version check).
- Integration: new SQL-constraint test accepts single/multipart ETags and numeric generations and rejects quoted, uppercase, `-0`, `0` and traversal values.
- `pnpm run typecheck`, `pnpm lint` passed. Prettier (`--end-of-line auto`) passed over the format scope.
- Unit tests: 674 passed (47 files). Embedded integration: 190 passed, 2 skipped (21 files), including all 15 asset-cleanup and 2 asset-visibility cases after migration `0013`.
- `pnpm --filter @workspace/api-server run build` passed; the bundle no longer references `@google-cloud/storage`, and `@aws-sdk/client-s3` resolves from the API package at runtime.

## Hosted CI

- `ad2899d`: [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39503904988) passed, including native PostgreSQL `test:all`. [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39503904943) **failed**: gitleaks reported 2 `generic-api-key` findings. A local run of the same pinned, checksum-verified gitleaks 8.30.1 (WSL) located them at `tests/community-assets.test.ts:30` (a UUID fixture named `key`) and `tests/asset-upload-route.test.ts:57` (a disposable `SESSION_SECRET` test value). Neither is a credential.
- Repair: renamed the fixture to `objectId` and generated the session value with `"r".repeat(40)`; added two exact-path, exact-line reviewed exceptions in `.gitleaks.toml` for the historical lines (history is not rewritten); raised the reviewed-exception count in `tests/ci-secrets.test.ts` from 2 to 4. A local full-history scan then reported zero findings. Hosted result for the repair is recorded in the next checkpoint.

**Not run:** any request against real Cloudflare R2 (no bucket or credentials exist yet), native PostgreSQL `test:all` (hosted CI), browser E2E.

## Remaining risks

- Live R2 acceptance: put/get/head/delete with a bucket-scoped token, 404 semantics, private-bucket anonymous denial, and request timeouts.
- Abandoned `pending` reservations keep quota until the user deletes them; a crash after the R2 write but before commit leaves an object at the reserved key that only an explicit delete or reconciliation removes.
- The API holds one asset row lock during a single R2 write (at most 8 MiB, 30 s request timeout).
- Each in-flight upload buffers up to 8 MiB in API memory; Render Free has 512 MB. Concurrency is bounded only by the per-user and global rate limits.
- Image decoding/re-encoding (S-02) is task 4.

## Next step

Task 4: decode and re-encode uploads with `sharp` (pixel, dimension and frame caps; metadata stripped) before the R2 write.
