# Image decoding and canonical re-encoding — October 21, 2026

Parent: `af0a513` (gitleaks false-positive repair). Hosted [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39504688559) and [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39504688577) passed on `af0a513`, closing the Security failure recorded for `ad2899d`.

## Scope

Close the source side of risk S-02: uploaded images were stored after a magic-byte check only. Now only pixels decoded and re-encoded by the API reach R2.

## Changes

- `artifacts/api-server/src/services/image-canonical.ts` (`sharp` 0.35.5, published 2026-09-27; no install script, prebuilt `@img/sharp-*` packages for win32-x64 and linux-x64 are in the lockfile):
  - Header-only `metadata()` first: the real format must equal the declared type; at most 8,192 pixels per side and 25 megapixels; more than one page (animation) is rejected rather than silently flattened.
  - Full decode with sharp's pixel limit as a backstop, `failOn: "warning"` (truncated/corrupt input fails), `autoOrient()`, a 20-second timeout, then a fresh encode to the same format (PNG default, JPEG/WebP quality 85). sharp writes no EXIF/XMP/ICC metadata by default.
  - `sharp.cache(false)`, `sharp.concurrency(1)`, one decode at a time with up to four waiting; more returns `503 IMAGE_PROCESSING_BUSY`.
- `services/community-assets.ts`: `storeAssetContent` reads the row without a lock, runs the cheap size/type/signature checks, decodes **without holding the row lock**, refuses output over 8 MiB, then locks, rechecks owner/state/expiry, writes the canonical bytes and records their size (`size=$2`).
- Docs: `docs/community.md` limits, risk register S-02 source update, `docs/production-plan.md`.

## Validation (local)

- New `tests/image-canonical.test.ts` (13, real encoder output): PNG/JPEG/WebP round trips; EXIF and ICC removed and the EXIF marker string absent from output bytes; orientation 6 applied (40x20 becomes 20x40); declared-type mismatch; truncated JPEG, PNG signature plus garbage and empty body rejected; over-wide image rejected; a 6000x6000 header-only PNG bomb (under 200 bytes) rejected from its header in under 2 seconds; a two-frame animated WebP rejected; with six simultaneous calls exactly one gets 503, and the queue drains afterwards.
- `tests/community-assets.test.ts`: canonical bytes, not the original, are written and their size recorded; one `FOR UPDATE` query; cheap and state checks run before decoding; a decode rejection writes nothing; a state change during decoding is caught under the lock; oversized output refused.
- Measured locally: a full-noise 5000x5000 JPEG (17 MiB, above the upload cap, used as an upper bound) decoded and re-encoded in 262 ms on one core with about 13 MB of extra resident memory. Render Free has a fraction of a CPU, so expect seconds for the largest accepted images.
- `pnpm run typecheck` (including the tests project), `pnpm lint` passed; Prettier (`--end-of-line auto`) passed over the format scope.
- Unit tests: 690 passed (48 files). Embedded integration: 190 passed, 2 skipped (21 files).
- `pnpm --filter @workspace/api-server run build` passed; the bundle imports `sharp` as an external that resolves at runtime from the API package.
- `pnpm audit --audit-level moderate` passes; `pnpm audit` reports one **low** `markdown-it` advisory in the dev-only `orval` toolchain. Its fix is a release under a week old, so it is not pinned here.

**Not run:** decoding on Linux locally (hosted CI runs these tests on Ubuntu), live R2, browser E2E.

## Remaining risks

- Decoding runs inside the API process, not an isolated worker; a libvips vulnerability would affect the API process. The pixel cap bounds the worst decode at about 100 MB (25 MP RGBA) on a 512 MB instance.
- PNG re-encoding at the default compression can enlarge an already-optimized PNG; output over 8 MiB is refused with a clear message.
- Abandoned `pending` reservations and crash-after-write orphans (S-03) are unchanged.

## Next step

Task 5: social login for Google, GitHub, Microsoft, LinkedIn, GitLab, Discord, X and Facebook, showing only providers enabled in Supabase.
