# Deployment intake checkpoint — October 17, 2026

## Owner-approved deployment scope

- Deploy **separate free-tier staging first**; public launch requires later approval and release verification.
- Frontend: Vercel. API: Render. Database/authentication: a **fresh Supabase project**, leaving existing local Firebase identities and local data untouched.
- Initial users: India. Prefer compatible nearby database/API regions based on actual free-tier availability; no region has been provisioned yet.
- No custom domain is owned. Start with provider-assigned HTTPS URLs. Cloudflare DNS/CDN/WAF/DDoS/bot integration is pending domain ownership and a separately verified routing/proxy design; DNS-only records do not provide proxy protection.
- Application error monitoring: Sentry, with sensitive-data scrubbing and no session replay/user-content capture by default.
- Budget: free only for now. Ask before any paid service, upgrade, domain purchase, billable add-on, or additional storage project.
- Owner confirmed current use is personal/non-commercial for Vercel Hobby eligibility.
- Owner explicitly approved limited staging: native Git hosting and background AI jobs may be unavailable; uploads stay unavailable until a safe Supabase Storage adapter is implemented and verified. Show these limitations honestly without deleting product features.

## Discovery completed

Repository was clean at `f293412c07a8308851964c0aec0dd5b40b791ad2` on `master` at intake. Read the repository working agreement and previous checkpoint. Existing private GitHub connection is available.

Hosted CI for that SHA is **not green**:

- ProofStack CI run `38984514962` failed root test typechecking because `express` and its declarations were not declared at the root importing them; the API workspace alone declares them. Local installs had masked this boundary.
- ProofStack Security run `38984515027` executed CodeQL analysis but failed with `Resource not accessible by integration` for the Actions workflow-run endpoint. Narrow workflow permissions need correction and exact-head hosted verification; no entitlement conclusion is assumed from this error alone.
- Dependabot update run `38984517778` succeeded; that is not the application quality gate.

A separate scoped CI repair is in progress. Its files and validation belong to the next checkpoint, not this intake's completed work.

## Hosting compatibility findings

- `artifacts/proofstack/next.config.ts` already supports frontend `/api/*` rewrites using `API_INTERNAL_ORIGIN`. Preserve same-origin authentication cookies and exact HTTPS `AUTH_APP_ORIGIN`; verify redirects, CSRF and cookie persistence end to end.
- `artifacts/api-server/src/lib/auth-config.ts` supports explicit `AUTH_PROVIDER=supabase` and requires `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and a strong `SESSION_SECRET`. Privileged values belong only in the API's secret manager, never frontend build/public variables.
- `lib/db/src/index.ts` uses native node-postgres with a maximum-ten connection pool and does not disable TLS validation. Provision a least-privileged runtime role, keep migrations separate, verify actual Supabase connection mode/certificate behavior and restrict public Data API exposure. Do not run migrations against an unidentified existing database.
- `artifacts/api-server/src/lib/objectStorage.ts` currently depends on Replit's local credential/signing sidecar and Google Cloud Storage semantics. Supabase Storage is **not** a configuration-only substitution. Preserve private access, byte limits and cleanup correctness when implementing an adapter; do not claim compatibility with generation fencing without verifying the provider's semantics.
- `artifacts/api-server/src/app.ts` trusts explicit proxy CIDRs only and marks API responses private/no-store. Multi-hop Vercel/Render/Cloudflare client IP and direct-origin behavior require verification; never set blanket trust or cache authenticated responses to make deployment appear healthy.

## Access and external state

Hosted connector authorization was initiated for Vercel, Supabase, Sentry and Cloudflare. It is awaiting user completion and must be checked before using accounts or creating resources. Render is not exposed by the currently discovered connector tools and needs separate authenticated access. Never ask for secrets in chat.

No cloud project/service, database, bucket, DNS record, domain, monitoring project or deployment was created in this intake. No existing provider settings, local Firebase configuration or data were changed. No charge or migration was incurred.

The browser automation session could not start because the user's browser profile is locked. The browser was not closed or modified; provider OAuth authorization should continue in the user's browser. A non-browser fetch verified Vercel Hobby's documented eligibility restriction.

## Provider constraints and source references

These are documented plan constraints, not observations of provisioned accounts or measured workload capacity:

- [Render Free](https://render.com/docs/free): free web services spin down after 15 minutes idle and cannot attach persistent disks. Its documentation advises against production use. Do not run Git repositories on ephemeral storage.
- [Supabase pricing](https://supabase.com/pricing): Free currently lists a 500 MB database, 1 GB file storage, a two-active-project limit and inactivity pausing. Start with one project, measure usage and ask before expansion; do not assume three free projects or shard one identity/database arbitrarily across projects.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): personal/non-commercial use restriction, confirmed from an HTTP 200 fetch of official documentation.
- [Cloudflare in front of Vercel](https://vercel.com/docs/integrations/external-platforms/cloudflare): Vercel discourages stacked reverse proxies because of traffic visibility, security signals, latency and caching. Revisit the owner's requested Cloudflare CDN/protection topology before domain cutover; provider-default URLs alone are not Cloudflare-protected.

## Next safe actions

1. Finish and validate the scoped CI repairs; checkpoint, commit, push and inspect exact-head hosted runs.
2. Confirm user-completed connector authorization; identify correct provider accounts/workspaces and establish Render access without printing credentials.
3. Read back available plans/regions and confirm fresh staging targets. Prepare minimal provider deployment configuration and Sentry instrumentation with tests, then create only authorized free resources.
4. Provision and migrate only the fresh Supabase target with verified grants/TLS; configure authentication URLs and required provider/SMTP setup securely. Configure Render API and Vercel frontend, with visible approved feature limitations.
5. Verify deploy terminal states, HTTPS/readiness, authentication/CSRF/session flows, database isolation and sanitized Sentry test-event ingestion. Keep public launch, custom-domain Cloudflare protection and all remaining production risk-register gates explicitly open.

**Status: deployment preparation, not a deployed application and not production approval.**
