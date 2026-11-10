# ProofStack repositories, steps 1–2 — November 10, 2026

Parent: `df2246f`. Owner-approved plan: repositories and demos hosted on ProofStack, addressed by ProofStack username (not GitHub), free tier.

## Step 1 — repositories survive restarts (`bf3474f`)

Render Free wipes its disk on restart and deploy. With `REPOSITORY_STORE=r2`, each repository is also kept in R2 as one Git bundle (`<PRIVATE_OBJECT_DIR>/repositories/<id>.bundle`):

- **Saved** inside the transaction that records every change (create, commit, branch, push, pull-request merge). Branch and tag heads come from the database and are synced into Git first. If the save fails, the change is rolled back, so the database never points at objects that were not saved.
- **Restored** the first time a repository is opened after a restart (one restore at a time per repository). A repository with no saved copy reports "storage unavailable" instead of appearing empty.
- Unchanged repositories are not re-uploaded (object-count fingerprint).

## Step 2 — `/<username>/<repo-name>` (`9341a06`)

- Migration `0020`: repositories get `owner_id` and `name` (existing ones: the project's owner and slug); names are 1–100 of letters, digits, `.`, `-`, `_`, start with a letter or digit, never end in `.git`, unique per owner ignoring case.
- **New project** shows "Create a ProofStack repository" (when hosting is on) with a name field that follows the slug and previews the address. The project's **Repository URL fills itself** as `<site>/<username>/<name>` (left alone if the member had set one).
- **`/<username>/<name>`** shows the repository; built-in pages such as `/settings/profile` still take precedence, and the header highlights Code. `/repositories/<id>` keeps working.
- **`git clone <site>/<username>/<name>.git`**: the web tier forwards these paths like API calls (client address and proxy secret), and the API resolves them to the existing Git endpoints.
- Every top-level page name is now a reserved username; `tests/site-addresses.test.ts` fails if a new page is added without reserving it.

## Validation

- Unit: 833 passed. Embedded PostgreSQL: 231 passed, 2 skipped, including `tests/repository-store.integration.test.ts` (save on change, restore after the disk is wiped and keep working, refuse a change that cannot be saved, report a missing copy) and address coverage in `tests/editor.integration.test.ts` (Repository URL filled, lookup ignoring case, one name per owner, invalid names refused, clone by address, unknown address 404).
- Typecheck, lint, format check and audit pass; the built API starts. Cloudflare runtime: `/someone/weather-app` renders with title "someone/weather-app"; `/settings/profile`, `/projects`, `/code` unaffected; `.git` paths are forwarded to the API. Hosted CI and Security passed on `9341a06`.
- Neon staging migrated to 21. **Production migration pending the owner's approval**, then Render deploy with `REPOSITORY_ROOT=/tmp/proofstack-repositories` and `REPOSITORY_STORE=r2`.

## Next

Step 3 (hosted repositories in the Code editor and Run) and step 4 (demo site, Publish demo, auto-filled Demo URL).

## Release and live check (November 10)

- `9a53b2e` added private personal projects (owner and active contributors only), the live "Name already taken" check, the reserved-username guard, and identical answers for private and unknown clone addresses.
- The Render deploy went out before the production migration; for a few minutes every request answered 503 `SERVICE_UPDATING` (schema guard), with no data affected. Migration `0020` was then applied to production (21 migrations) and the API recovered by itself. Extension prompts now carry the "wait for the migration" instruction themselves.
- Owner's live test (Chrome extension): a Private project "QA Test Repo" created `https://proofstack-web.suhailalam302.workers.dev/suhai/qa-test-repo`, the Repository URL filled itself, the address opened with `README.md` and one commit, and a second project with the same name showed "Name already taken".
- Signed-out check from outside: the private repository, its project page and `git clone` address answer exactly like addresses that do not exist (404 / 404 / 401 with the same error); it appears in no public list or search.
- `b339f55`: the project page shows one **Code** button for a hosted repository (no "manual link" label), and the name check no longer flashes "Name already taken" while saving. CI and Security passed.

## Step 3 — ProofStack repositories in Code

- The editor lists ProofStack repositories by address (`handle/name`) and opens on them for members who have not connected GitHub (`?source=github|hosted` still wins). With no repository yet, it explains how to create one and links to Projects.
- The repository page is titled by its address, with the project as the eyebrow, and offers **Open in Code** (`/code?source=hosted&repo=<id>`) to members who can write; read-only viewers do not see it.
- The default branch stays protected: commits go to a new branch, and the notice then links **Open a pull request** to the repository's own pull requests page (GitHub repositories keep the in-editor panel). Run and Preview work on ProofStack repositories as on GitHub ones; preview images load only for GitHub repositories for now.
- Validation: unit 836 passed (new: address title and Open in Code only for writers); embedded PostgreSQL 233 passed, 2 skipped (editor list by address); typecheck, lint, format; the built API starts.

## Step 4 — demos hosted on ProofStack

- **Demo site** (`artifacts/demos`): a separate Cloudflare Worker serving `<DEMO_ORIGIN>/<handle>/<repository>/…` from R2 keys under `private/demos/` only (read-only `get`; no listing). `/handle/repo` redirects to `/handle/repo/`; folders serve `index.html`; `..`, encoded slashes, backslashes and NUL are refused; content types by extension; `nosniff`; one-minute cache so re-publishing shows quickly. Its own address keeps demo scripts away from ProofStack cookies.
- **Publish demo** (repository page, Live demo panel; owners and managers of public projects): choose a branch; the site is the top-level `index.html` or the first of `dist`, `build`, `public`, `docs`, `site` that has one; at most 500 files and 25 MB; the previous copy is replaced. The project's **Demo URL fills itself** (unless it links elsewhere). **Unpublish** deletes the copy and clears that Demo URL. Private projects cannot publish (403). 20 publishes per hour per member.
- No database change. `DEMO_ORIGIN` on the API turns publishing on.
- Validation: unit 841 passed (`tests/demo-site.test.ts`: address mapping, path tricks refused, headers, 404, redirect, method limit; folder choice and limits). Embedded PostgreSQL 234 passed, 2 skipped (`tests/repository-store.integration.test.ts`: nothing to publish explained, `dist/` site published with types, sources left out, Demo URL filled and reported, unpublish clears files and URL, private refused). Typecheck, lint, format; the built API starts.
