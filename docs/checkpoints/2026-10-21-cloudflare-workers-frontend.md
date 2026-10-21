# Cloudflare Workers frontend — October 21, 2026

Parent: `b041f7d` (inert scheduled maintenance). Hosted [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39514929141) and [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39514929053) passed on `b041f7d`.

## Scope

Run the Next.js 16 frontend on Cloudflare's free tier, which (unlike Vercel Hobby) allows commercial use. The owner asked for Cloudflare **Pages**; that is not viable: Cloudflare's Pages adapter for Next.js (`next-on-pages`) is deprecated/archived and supported only Next 13–14. Cloudflare's supported path for server-rendered Next.js 16 is **Workers** with the OpenNext adapter, which was used.

## Compatibility spike (throwaway clone, Linux/WSL, local `workerd`)

- `@opennextjs/cloudflare@1.20.9` (published 2026-10-06; peer `next >=16.3.8`) and `wrangler@4.148.0` (2026-10-06).
- On Windows, OpenNext's bundler fails reading pnpm's symlinked `node_modules` ("Access is denied"). On Linux it succeeds; Node 24.18.0 was installed in the WSL user's home from nodejs.org after SHA-256 verification.
- In local `workerd`: `/`, `/auth`, `/community`, `/repositories` return 200; `proxy.ts` (Node runtime in Next 16) runs, emitting the CSP header and per-request nonce; the `/api/*` rewrite proxies GET and POST bodies; `cf-connecting-ip` is forwarded with the shared secret and client-forged `x-proofstack-*` headers are replaced.
- Size: the first build was **3,292 KiB gzip**, over the Workers Free 3,072 KiB limit. CodeMirror and all its language grammars (≥1.2 MB raw) were in the server bundle although the editor is browser-only. Loading the editor with `next/dynamic` and `ssr: false` reduced the Worker to **2,636 KiB gzip (436 KiB headroom)**. The unused `next/og` WebAssembly (`resvg`/`yoga`, ~557 KiB gzip) is still bundled by Next and was not needed to fit.

## Changes

- `features/repositories/repository-forms.tsx`: client-only CodeEditor with a loading placeholder.
- `artifacts/proofstack`: dev dependencies `@opennextjs/cloudflare@1.20.9`, `wrangler@4.148.0`; `open-next.config.ts`; `wrangler.jsonc` (`nodejs_compat`, `global_fetch_strictly_public`, observability, `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip`); scripts `cf:build`, `cf:preview`, `cf:deploy`.
- `pnpm-workspace.yaml`: `allowBuilds.workerd: true` (downloads the Workers runtime); override `'miniflare>sharp': 0.35.5` for GHSA-wq5f-xc86-pv6w (miniflare pinned sharp 0.35.4; dev-only). `pnpm audit --audit-level moderate`: no known vulnerabilities.
- `.gitignore`: `.open-next/`, `.wrangler/`, `.dev.vars*`.
- `.github/workflows/ci.yml`: the frontend build step is now `cf:build` (it runs the Next production build), followed by `scripts/ci-check-worker-size.mjs`, which fails above 3,072 KiB gzip as reported by `wrangler deploy --dry-run` (nothing uploaded). `tests/ci-workflows.test.ts` updated to require both, in order.
- Docs: `docs/deployment.md` Cloudflare Workers section (Workers Builds settings, build vs runtime variables, limits), `README.md`, `docs/setup.md`, `docs/production-plan.md`.

## Validation

- The size gate run against the spike build: passes at 3,072 KiB (exit 0) and fails at a 2,000 KiB limit (exit 1).
- `tests/worker-size.test.ts` (parser), `tests/ci-workflows.test.ts` passed.
- `pnpm run typecheck`, `pnpm lint`, Prettier (`--end-of-line auto`) passed. Unit tests: 723 passed (52 files). Plain `next build` on Windows passed.
- **Not verified:** `global_fetch_strictly_public` is not enforced by local `wrangler dev` (a rewrite to 127.0.0.1 succeeded locally), CPU time per request (no deployment), and an actual Cloudflare deployment. The first hosted run of `cf:build` is the CI run for this commit.

## Remaining risks

- Workers Free allows about 10 ms CPU per request; server-rendered pages may exceed it. Check Workers metrics after the first deployment; Workers Paid is $5/month.
- OpenNext is a third-party adapter that tracks Next.js releases; upgrade both together.
- `cf:build` does not run on Windows; use CI, Cloudflare's builder or WSL.

## Next step

Owner decision on the proposed Clerk/Neon/Resend changes (see the task response), then deploy staging.
