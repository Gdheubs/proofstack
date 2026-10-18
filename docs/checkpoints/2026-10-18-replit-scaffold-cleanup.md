# Replit scaffold cleanup and deployment alignment — October 18, 2026

## Scope

Removed Replit-only deployment scaffolding and the unused mockup sandbox, removed unused Replit package/plugin dependencies, and aligned the deployment overview with the intended Vercel frontend, Render API/workers, Supabase identity/PostgreSQL, and GitHub source/CI setup. No cloud resources or deployments were created.

## Changes

- Deleted `.replit`, `.replitignore`, `replit.md`, the entire `artifacts/mockup-sandbox/` workspace, and `.agents/memory/next-workspace-constraints.md`.
- Removed unused `@replit/connectors-sdk` and Replit Vite plugin catalog entries and corresponding lockfile references.
- Removed Replit development-domain allowances from API CORS/auth-origin fallback, Next.js development origins, and the development CSP frame policy. Authentication now requires explicit `AUTH_APP_ORIGIN`.
- Generalized development migration errors and updated README, `.env.example`, and setup docs for the target hosting layout.

## Validation and limits

- `git diff --check`: passed.
- Replit dependency/config search confirms no Replit package or Vite plugin remains in manifests/lockfile. Replit UI attribution comments were removed.
- Tests, typecheck, and formatting checks were not run in this turn.
- pnpm lockfile regeneration could not run: pinned pnpm 11.25.0 bootstrap failed with `EPERM` while creating a symlink in the sandbox's package store. The affected Replit lockfile importers/catalog/package entries were removed directly, but a frozen install must confirm lockfile consistency in an environment where pinned pnpm can run.
- The change is committed locally on `master`. Push was attempted but the configured GitHub CLI credential helper could not launch in this Windows sandbox; `origin/master` remains at the prior commit.
- Image uploads remain dependent on the Replit object-storage sidecar and are unavailable on Render until a Supabase Storage adapter is implemented and validated. Optional AI uses configured OpenAI-compatible endpoint credentials. The app is not yet fully Replit-independent or deployment-ready for uploads.

## Next action

Retry pushing `master`, run the frozen install and project checks with pnpm 11.25.0 in a normal development environment, then implement and validate the Supabase Storage adapter before enabling uploads on Render.
