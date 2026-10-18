# Frontend ownership cleanup — October 18, 2026

## Scope

Consolidated frontend ownership after tracing Next.js aliases, application imports, Vitest aliases and fixtures, lint/format inputs, and the production build. The API specification and generated API client/schema packages were not moved or edited.

## Changes

- Moved account, assessments, auth, careers, community, intelligence, pulls, and repositories UI into `artifacts/proofstack/features/`. Moved auth status into `features/auth/status.tsx`.
- Kept route/layout ownership in `app/`, application-shell components in `components/`, and design-system primitives in `src/components/ui/` through the explicit `@/components/ui/*` alias.
- Moved shared hooks (`use-mobile`, `use-toast`) into `hooks/` and `cn` into `lib/utils.ts`; removed obsolete `src/hooks/` and `src/lib/` aliases and TypeScript includes.
- Updated Vitest aliases and route/component fixtures, React-hook lint coverage, root lint/format inputs, and the architecture workspace map.
- Converted the toast action-name object to a type-only definition after centralization exposed an unused-value lint error.

## Validation

- `pnpm --filter @workspace/proofstack run typecheck`: passed.
- `pnpm --filter @workspace/proofstack run build`: passed; all application routes compiled and generated.
- `pnpm lint`: passed, including `features/`.
- Focused frontend tests: 149 passed across 8 test files.
- `pnpm test`: 617 passed, 1 failed. The failure is `tests/asset-cleanup-metadata.test.ts`, whose expected table count (46) conflicts with the 49 tables present during separate asset-lifecycle schema work.
- `pnpm typecheck`: library, API, frontend, and scripts checks passed; test-project checking is blocked by two `TS2339` errors (`client.query` on `never`) in the untracked `tests/asset-lifecycle-store.test.ts`.
- `pnpm format:check` on Windows reports formatting issues in 359 repository files; no broad formatting rewrite was applied. The hosted Linux check on the first task SHA isolated six task-owned files; those files were formatted and their focused Prettier check now passes.
- `git diff --check`: passed for both the initial task diff and the follow-up formatter correction; only Git line-ending normalization warnings were emitted.
- Gitleaks 8.30.1 archive SHA-256 verified against the repository-pinned checksum; scan ran in WSL with redaction and reported 0 findings.

## Hosted follow-up

- Initial task commit `3d1f5f3f4197a19f90c3106e54406bccb0135bb3` was pushed and read back from `origin/master` exactly.
- [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39156545526) passed for that SHA.
- [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39156545454) passed install, migrations, codegen, audit, and lint, then failed at `pnpm format:check` on six task-owned files. The later CI steps were skipped.
- Those six files were formatted. Focused Prettier, lint, 149 frontend tests, and the Next production build pass after the fix.
- Follow-up commit `26f3faf3d8e6b12252220a2d5bf881e823d9c6d0` was pushed and read back from `origin/master` exactly. [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39158268657) and [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39158268663) both passed for that SHA.

## Remaining gates and next action

The active asset-lifecycle work remains untouched in the worktree and accounts for the local full-suite test/typecheck failures above. No deployment was performed. The final evidence update must be committed and pushed; then read back the remote SHA and inspect CI for that exact SHA.
