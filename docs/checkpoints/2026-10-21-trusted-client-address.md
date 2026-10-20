# Trusted client address behind the web proxy — October 21, 2026

Parent: `21fda2b` (markdown-it advisory override). Hosted [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39499901416) and [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39499900942) passed on `21fda2b`, closing the CI failure recorded for `e3b0804`.

## Problem

Browsers reach Express through the web tier's `/api/*` rewrite (Vercel or Cloudflare Workers to Render). Express deliberately trusts no forwarding headers, so every user arrived from the web tier's address and shared one bucket for the global API limit and every per-IP authentication limit. One user exhausting, for example, the one-per-minute OTP resend limit would have blocked all users.

## Changes

- `artifacts/api-server/src/lib/client-ip.ts`: `trustedProxyClient` accepts `x-proofstack-client-ip` only when `x-proofstack-proxy-secret` matches `PROXY_SHARED_SECRET` (SHA-256 digests, `timingSafeEqual`) and the value is a valid IP; both headers are always removed from the request. `rateLimitAddress` returns the trusted address, else the socket/Express address, and buckets IPv6 by /64 (IPv4-mapped IPv6 maps to IPv4).
- `app.ts` installs the middleware before logging and limits. `middlewares/rate-limit.ts`, `services/auth-limits.ts` and the anonymous Git read limit in `routes/repositories.ts` use `rateLimitAddress`.
- `lib/env.ts`: optional `PROXY_SHARED_SECRET`, blank = disabled, otherwise at least 32 characters.
- `artifacts/proofstack/proxy.ts`: the matcher now includes `/api`. API requests skip CSP handling; client-sent trust headers are deleted; with `PROXY_SHARED_SECRET` and an allowlisted `TRUSTED_CLIENT_IP_HEADER` (`cf-connecting-ip` or `x-real-ip`), the edge-provided address and secret are added to the forwarded request.
- `scripts/preflight.mjs`: new failing check when `PROXY_SHARED_SECRET` is missing or short.
- `.env.example`, `render.yaml`, `docs/deployment.md`, `docs/security.md` document both settings.

## Validation (local)

- New `tests/client-ip.test.ts` (12 tests): secret required, wrong/missing/extended secrets ignored, invalid or list-valued addresses ignored, headers stripped, IPv6 /64 bucketing cases, environment validation, matching header names across tiers, web proxy forwarding/stripping/page CSP behavior.
- `tests/preflight-checks.test.ts`: new missing/present secret case; 7 passed.
- **End-to-end on a real `next build` + `next start`** with `API_INTERNAL_ORIGIN` pointed at a local header-echo server: edge `x-real-ip` and the secret reached the external rewrite; client-forged `x-proofstack-*` headers arrived as absent; a POST body and IPv6 address passed through.
- `pnpm run typecheck`, `pnpm lint` passed; Prettier (`--end-of-line auto`) passed over the format scope plus `artifacts/api-server/scripts`.
- Unit tests: 633 passed (46 files). Embedded integration: 189 passed, 2 skipped (21 files). Next production build succeeded.

## Remaining risks

- The secret is static; rotation requires updating both tiers together (brief window of shared buckets during rollout, no security exposure).
- Requests that bypass the web tier and call Render directly still share Render's proxy-address bucket. That affects only direct callers, not browser users.
- Cloudflare Workers compatibility of `proxy.ts` is verified in task 7, not here.

## Next step

Task 3: replace the Replit/GCS object-storage adapter with Cloudflare R2.
