# First live review and sign-in callback fix — October 21, 2026

Parent: `45640b9`. Neon staging and production were migrated with `migrate:release` (14 of 14; reruns applied 0; 49 public tables). The web Worker (Cloudflare) and API (Render Free, Oregon) were deployed by the owner.

## Live review (anonymous, read-only)

- Passed: pages render; CSP with nonce, HSTS, frame, nosniff and permissions headers; `/api/healthz` and `/api/readyz` (database ready) through the Worker; account/admin/operations/intelligence return 401; a foreign `Origin` gets 403; missing CSRF, malformed JSON and oversized bodies are refused; `__Host-` cookies are HttpOnly/Secure/SameSite=Lax; the API rate limit returns 429 after ~120 requests/minute from one address.
- Load probe: 200 page requests at concurrency 20 all succeeded (p50 65 ms, p95 0.8 s). API calls p50 ~0.5–0.65 s; the first request after idle took 42–60 s (Render Free spin-down).

## Defect fixed

`GET /api/auth/callback` returned **404** through the Worker while Render alone returned the expected 303. OpenNext's `fetch` external-rewrite proxy (`@opennextjs/aws` 4.1.8) calls `fetch` without `redirect: "manual"`, so the Worker followed the API's relative redirect to `/auth` on the API origin (no such route) and discarded the session cookies set on the 303. Every email confirmation, password-reset and social sign-in was affected.

The callback now answers 200 with a minimal page that navigates to the same fixed `/auth` destinations (`meta refresh` plus link, `Referrer-Policy: no-referrer`), so its cookies reach the browser. It was the API's only redirect; a test now fails if `res.redirect(` appears in the API source.

## Validation

- `tests/auth-callback.integration.test.ts` (embedded PostgreSQL): 3 passed, including the session cookie on success, the fixed failure destination with an attacker `next`, and the no-redirect guard.
- `pnpm run typecheck`, `pnpm lint`, unit tests (740 passed, 53 files).
- **Not yet verified live:** the callback through the deployed Worker after this deploys.

## Open findings (not fixed here)

- Email delivery is development-limited (no sending domain/SMTP); public sign-up cannot confirm.
- No social providers are enabled in Supabase.
- Render runs in Oregon while Neon is in Singapore: each query crosses the Pacific. Recreate the Render service in Singapore.
- `/privacy` and `/terms` are missing; `/design-system` and `/foundation` are public.
- At ~1,000 active users the free tiers are exceeded: Workers Free (100,000 requests/day, every API call passes through the Worker), Render Free (spin-down, 512 MB), Neon Free (100 CU-hours/month with no idle time).

## Next step

Deploy, confirm `/api/auth/callback` through the Worker returns the continue page, then move Render to Singapore and start task 9 (legal pages, account deletion, hide internal pages, monitoring).
