# Skill Check platform API contracts (2026-11-20)

Parent: `567f4c7` (backup and restore pipe fix; hosted CI passed).
Status: **work in progress**. The new platform endpoints remain feature-off
placeholders; this checkpoint does not enable product workflows or constitute
launch approval.

## Scope

Continued WIRE-1 from `docs/skill-check-platform.md`: added OpenAPI definitions
for the platform, media, social, moderation, skill authoring/attempts/grading,
education, organization results, and career-check route families. Connected
those definitions to the root API spec and Orval's allowlist, then generated
the React client and Zod schemas/types. Added boundary coverage for the stub
routes and cross-site action/upload requests.

The Zod package now exposes generated schemas from its root and generated
TypeScript contracts through the `ApiTypes` namespace. This avoids ambiguous
root exports where Orval creates both a Zod schema and a type with the same
name.

## Validation actually run

- Orval generation (`orval --config ./orval.config.ts`): passed for both
  `api-client-react` and `zod` after running outside the sandbox because its
  React client subprocess was blocked with `spawn EPERM`.
- TypeScript project build (`node_modules/.bin/tsc.cmd --build`): passed after
  the export collision fix.
- Focused API boundary tests (`vitest run tests/api.test.ts`): 12 passed.
- ESLint on `tests/api.test.ts`: passed.
- Prettier check on the touched API spec/config/test files: passed; the package
  barrel was formatted after resolving its export collision.
- `git diff --check`: passed; Git emitted only line-ending normalization
  notices for generated files.

The normal `pnpm` shim refused to start because it could not verify the
registry signature for the pinned pnpm release. The generated-output drift
checker is designed for a clean committed tree, so its local run reported the
expected generated-file changes before commit; the pushed CI run must verify
that regeneration leaves the committed tree clean.

## Remaining work and next step

The new route contracts are deliberately additive and still have broad generic
payload/response fields. The handlers remain feature-off stubs. Continue WIRE-1
by reviewing and tightening schemas against the platform spec, then implement
the selected first module slice and its authorization, state transitions,
audit trail, and tests. Record owner decisions as product constraints; current
defaults are no online checkout/invoice grants, current edge-vendor video,
owner-team grading with calibration, counsel review before recording/AI is
enabled, and 18+.

No production deployment or external provider was configured.
