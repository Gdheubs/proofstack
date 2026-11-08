# Live QA fixes — November 8, 2026

Parent: `7eb6812`. From the owner's browser QA pass of the live site.

## Findings and changes

- **Blocker, not a code bug: sign-in down.** `GET /api/auth/context` returned 500 on every page. The Supabase project's address no longer resolved (non-existent domain): free projects are paused after a week of low activity, and the site had little traffic. The owner restores the project in the Supabase dashboard.
  - The API now treats an unreachable identity provider (paused project, DNS or network failure) as an outage: `503 AUTH_PROVIDER_UNAVAILABLE` with "Sign-in is temporarily unavailable. Try again in a few minutes", instead of an unhandled 500. Provider settings already read stay in use during a short outage.
  - New workflow `ProofStack Keep-alive` loads `/api/auth/context` once a day, which reaches the identity provider as a visitor does, and fails loudly if sign-in is down. It uses no actions and no secrets; set the repository variable `SITE_URL` after the custom domain exists.
- **`ReferenceError: __name is not defined` on every page:** wrangler's default `keep_names` wraps functions that next-themes serialises into its inline theme script. Set `"keep_names": false` in `wrangler.jsonc`; this also removes the light-to-dark flash.
- **503s while typing in Opportunities and Talent search:** one request per keystroke while the API was waking. Search and skill boxes now wait for typing to pause (300 ms, `hooks/use-debounced.ts`).
- **404 page:** plain wording, its own title ("Page not found"), links to the home page and opportunities; no internal "Phase 1" text or link to the hidden `/foundation` page.
- **Footer:** Opportunities listed once; Resources shows Skill checks and About.
- **Pager:** Previous/Next hidden when there is only one page of results.
- **"Create a recruiter account"** now preselects Recruiter on the sign-up form (`/auth?mode=signup&kind=recruiter`).
- **Dependency advisories published since the last push** (CI audit failed on `d7c8c3f`): pinned `qs` 6.16.1 (GHSA-6pq8-jhm2-2vcw, Express) and `re2js` 2.8.7 (GHSA-gg6h-894w-4m9c, legacy Firebase client). Recorded a dated audit exception (revisit by 2026-12-08) for GHSA-3g3m-2fjr-6pw4 (`glob`) and GHSA-g3hv-75wg-m249 (`minimatch`): both apply only to build, lint and SDK tooling with fixed patterns, and their fixes are new ESM-only majors the dependents do not support yet.
- **Still owner's:** legal placeholders (`[Your full legal name]`, address, grievance officer) need the operator's details in `artifacts/proofstack/lib/legal.ts`; the signed-in QA pass (Part B) and phone-size pass wait for sign-in to be restored.

## Validation

- Unit: 813 passed (`tests/auth-social-providers.test.ts` covers an unreachable provider and reuse of earlier settings; `tests/ci-workflows.test.ts` allows an action-free workflow while still requiring pinned actions overall).
- Typecheck, lint and the format check pass. The built API starts and answers `/api/healthz`.
