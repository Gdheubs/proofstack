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
