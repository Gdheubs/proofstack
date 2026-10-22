# In-browser code editor — October 22, 2026

Parent: `d276659`. Owner request: a VS Code-style editor where individuals and companies can code and update their repositories. Decision: **both sources**. GitHub repositories work now; ProofStack-hosted repositories appear once `REPOSITORY_ROOT` is on a durable disk (paid Render plan).

## What it does

`/editor` is linked under Community → Code editor and is client-only (`next/dynamic`, `ssr: false`), so the Worker bundle barely grows. The layout:

- **Title bar:** the source (GitHub or ProofStack), repository and branch, a reload button, and the connected GitHub account with a Disconnect link.
- **Activity bar:** Explorer and Source control.
- **Explorer:** a collapsible tree built from the full recursive file list, a filter box, a new-file action, delete, and A/M/D change markers.
- **Editor group:** tabs with modified dots, and CodeMirror 6 with lazy language support. It follows the site's light or dark theme and offers search, bracket matching, autocompletion and line wrapping. Ctrl/⌘+S opens Source control.
- **Source control:**
  - lists changed files with discard;
  - takes a commit message;
  - commits to a new branch, which hosted default branches require;
  - warns when committing straight to a GitHub default branch;
  - creates branches.
- **Status bar:** source, branch and head, read-only state, truncation, change count, line and column, and language.
- **Safety prompts:** switching repository or branch with uncommitted edits asks first, and leaving the page warns.

## Server (`/api/editor/*`)

- **Endpoints:** `sources`, `repositories`, `branches`, `tree`, `file`, `commit` (POST, 6 MB body), `branch` (POST), and `github/connect`, `github/callback`, `github/disconnect`.
- **Access:** every route requires an account. Writes also need CSRF. Per-account limits are 300 reads a minute and 30 commits per 10 minutes.
- **GitHub** (`services/github.ts`):
  - **Connection:** an OAuth App (`GITHUB_OAUTH_CLIENT_ID`/`SECRET`) with scope `repo`. The state is a signed nonce in an httpOnly `__Host-` cookie, compared in constant time. The callback answers with a continue page, never a redirect, because the Worker follows redirects.
  - **Token storage:** the token is sealed (`github-token` purpose) in `github_connections` (migration `0017`), excluded from data export, and deleted on disconnect, account deletion, or a 401 from GitHub.
  - **Requests:** 15-second timeout, `redirect: "error"`, and GitHub errors mapped to stable messages.
  - **Commits:** one Git Data API commit, built from the base tree, a new tree with inline contents or `sha: null` for deletes, and a commit. Existing file modes such as `100755` are kept. The ref update is `force: false`, and a moved branch gives 409 `BRANCH_MOVED`. Submodules and symlinks are not listed.
- **Hosted:**
  - New `commit-files` repository action and `commitChanges()` in `repository-git.ts`, with `commitFile` now a one-change wrapper. It keeps the existing permission, default-branch protection, `expectedHead`, quota and audit checks.
  - New `listFiles()` returns up to 10,000 files.
  - The stricter hosted path rules apply as well.
- **Limits:** 100 files per commit, 1 MiB per file, 5 MiB per commit. Paths may not be absolute or contain empty, `.` or `..` segments, control characters or backslashes.

## Validation

- `tests/editor.integration.test.ts` (8):
  - **Hosted, with real Git:** writable-only listing, multi-file commit onto a new branch with main refused, stale head refused, delete, and refusal of outsiders, unsafe paths and oversized files.
  - **GitHub, with a fake API:** connect-first rule, token never returned or exported, regular files only, commit payloads (modes kept, delete as `sha: null`, `force: false`), stale head refused, revoked token dropped, and OAuth state mismatch refused while the callback stays a page rather than a redirect.
- The navigation inventory now has 43 routes.

## Operator steps

Create the GitHub OAuth App and set the two variables on Render (`docs/deployment.md`, "Code editor (GitHub)"). Then run `migrate:release` for `0016` and `0017` before deploying the API.
