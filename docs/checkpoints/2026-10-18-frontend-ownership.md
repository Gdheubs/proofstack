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
- `pnpm format:check`: reports formatting issues in 359 repository files spanning docs, frontend, backend, and tests. No broad formatting rewrite was applied.
- `git diff --check`: passed before checkpoint creation; final diff check remains to be run.
- Gitleaks 8.30.1 archive SHA-256 verified against the repository-pinned checksum; scan ran in WSL with redaction and reported 0 findings.

## Remaining gates and next action

The active asset-lifecycle work remains untouched and accounts for the full-suite test/typecheck failures above. Hosted CI has not yet been checked for this task's commit. Stage and review only the frontend ownership changes and this checkpoint, commit on `master`, push to the verified `origin`, read back the remote SHA, then inspect CI for that exact SHA.