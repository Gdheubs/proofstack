# Git push write tokens and code editor — October 21, 2026

Parent: `b6f1103` (platform workflow verification).

## Scope

Review, repair and publish previously uncommitted Phase 4 work: token-authorized HTTPS feature-branch push, read/write token scopes, a CodeMirror browser editor, and a 1 MiB web-commit file limit. Native Git hosting stays **disabled** for the planned free-tier launch (`REPOSITORY_ROOT` unset) because Render Free has no durable disk; this code ships inactive.

## Changes

- API: `git-receive-pack` advertisement and RPC routes require a `psw_` write token held by a current project writer (`routes/repositories.ts`). `pushRepository` accepts exactly one create/fast-forward of a non-default branch, validates the pushed tree (regular files, safe paths, 10,000 files, 10 MiB each), checks quota, then updates the SQL branch row with an expected-head CAS and audits `repository.push` (`services/repositories.ts`, `repository-git.ts`, `repository-input.ts`).
- Token scope is encoded in the stored hash as `write:<sha256>`; legacy bare hashes remain read tokens. Write tokens cannot be minted without write access.
- Web commits accept 1 MiB UTF-8 files; the repository action JSON limit is 4 MiB (`app.ts`).
- Frontend: CodeMirror editor (`features/repositories/code-editor.tsx`), scope selector and scope labels in the clone panel.
- OpenAPI `RepositoryToken.scope` / `RepositoryInput.scope` and regenerated clients.
- Repaired two defects in the new integration test: missing `src/` directory before writing the pushed file, and revoking `tokens[0]` (now the newer write token) instead of the read token.
- Formatted eight work-in-progress files that failed Prettier; updated `README.md`, `docs/repositories.md`, `docs/pull-requests.md`, `docs/setup.md`.

## Review notes

`receive-pack` writes objects and the physical ref before validation. This is contained because every repository access runs through `lockedRepository`, which resynchronizes physical refs from authoritative SQL heads under the row lock; rejected pushes therefore never become visible to clone/fetch. Unreachable objects from rejected pushes remain the existing S-04 Git lifecycle risk.

## Validation (local, Windows, Node 24.18, pnpm 11.25)

- `pnpm run typecheck` — passed.
- `pnpm lint` — passed.
- Prettier with `--end-of-line auto` over the format scope — passed. Plain `pnpm format:check` reports CRLF differences on this Windows checkout (`core.autocrlf=true`); hosted Linux CI is authoritative for EOL.
- `pnpm --filter @workspace/api-spec run codegen` — output identical to the committed generated tree.
- Unit tests — 620 passed (45 files).
- Embedded PGlite integration suite — 189 passed, 2 skipped (21 files), including real `git push` acceptance/rejection.
- `pnpm install --frozen-lockfile` — lockfile up to date.

Not run: native PostgreSQL `test:all` (hosted CI covers it), browser E2E, Next production build (hosted CI covers it).

## Hosted CI

- `e3b0804`: [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39499465634) passed; [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39499465376) **failed** at `pnpm audit`: new advisory GHSA-r7fv-28h4-cvq7 for `markdown-it@14.3.1` (dev-only, via `orval>typedoc`). The same version was in the previously green lockfile; the advisory postdates that run.
- Repair: `pnpm-workspace.yaml` override `markdown-it: 14.3.2`; local `pnpm audit --audit-level moderate` reports no known vulnerabilities. Hosted result for the repair commit is recorded in the next checkpoint.

## Next step

Task 2 of the launch plan: trusted client-IP forwarding from the web proxy so per-IP rate limits are not shared by all users behind the Vercel/Cloudflare-to-Render hop.
