# UI redesign, phase 3: Code hub — October 24, 2026

Parent: `8be3108`. Delivers the GitHub fork, branch and pull-request actions approved in `docs/ui-redesign.md`.

## Changes

- **Open any GitHub repository** from the editor's title bar by `owner/name` or a pasted GitHub address (the "clone" step: the repository is browsed read-only until the member can write to it). `GET /api/editor/repository`.
- **Fork to edit:** a read-only repository shows a banner with _Fork to &lt;login&gt;_. `POST /api/editor/fork` forks on GitHub, waits briefly for the fork's default branch, and the editor switches to the fork. Limited to 5 forks per 10 minutes per member; audited as `editor.fork`.
- **Pull requests panel** (third icon in the activity bar, GitHub source only): the open pull requests of the repository, or of the repository a fork came from, each linking to GitHub; and a form that proposes the current branch (base branch, title, description). Forks propose upstream with `login:branch`. `GET /api/editor/pull-requests`, `POST /api/editor/pull-request` (20 per 10 minutes; audited as `editor.pull_request`). GitHub refusals (identical branches, duplicate) are reported as `PULL_REQUEST_REFUSED`; same-branch requests never reach GitHub.
- **After a commit to a branch,** the notice offers _Open a pull request_, which opens the panel with the commit message as the title.
- The **ProofStack source tab is hidden** while repository hosting is off (the hosted "Initialize a repository" form was already gated by the same flag), so the editor shows GitHub only.
- No new scopes: the existing `repo` scope covers forks and pull requests. No database change.

## Validation

- Unit: 801 passed (`tests/editor-client.test.ts` covers the repository-name parser and the explorer tree). Embedded PostgreSQL: 226 passed, 2 skipped; `tests/editor.integration.test.ts` gains open/fork/pull-request coverage against the fake GitHub API (request bodies, upstream head naming, refusals, invalid input).
- Typecheck, lint and Prettier pass. The built API starts and answers `/api/healthz`.
- Pages rendered in Cloudflare's runtime: `/`, `/auth`, `/code`, `/home`, `/settings`, `/privacy`. Hosted CI and Security passed on `291caea` (the first push, `3a07278`, failed the root typecheck on the new client test; fixed by typing the error payload). The live site serves the new `/code`.
- **Pending the owner:** Render deploy of `291caea` for the new editor endpoints, and the GitHub OAuth App (`GITHUB_OAUTH_CLIENT_ID/SECRET`) before any GitHub feature can be used live.
