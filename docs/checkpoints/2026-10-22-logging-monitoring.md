# Structured logging and Sentry monitoring — October 22, 2026

Parent: `150bd8a`. Owner request: pino, Sentry, morgan and winston. Decision after review: **pino only**, plus Sentry for the API and the browser. Morgan duplicates pino-http and winston duplicates pino; together they would write every event two or three times.

## Logging (pino)

- **Every line** carries `service`, `release` (Render commit), an ISO timestamp and, inside a monitored request, the Sentry `traceId`. Extra redactions cover `encrypted_token`, `access_token` and `client_secret`.
- **Request logs (pino-http)** produce one line such as `GET /api/community 200`, with `req.id`, `responseTime` and `userId` when signed in.
  - The level follows status: 5xx is `error` and 4xx is `warn`.
  - `/api/healthz` and `/api/readyz` are not logged.
  - pino-http's synthetic "failed with status code" error object is dropped.

## Sentry (`@sentry/node` and `@sentry/browser` 10.76.1, pinned)

- **API:** `src/instrument.ts` is imported first; the workers call `initMonitoring` themselves.
  - Configured by `SENTRY_DSN`, `SENTRY_ENVIRONMENT` and `SENTRY_TRACES_SAMPLE_RATE` (default 0.1); the release is `RENDER_GIT_COMMIT`. It is off when the DSN is unset.
  - `@sentry/node` is kept external to the esbuild bundle, so its OpenTelemetry dependencies load from `node_modules`. Incoming HTTP requests are traced.
  - Only unexpected (non-`ApiError`) 5xx errors are captured, tagged with the request ID, error code and account ID. Shutdown flushes pending events.
- **Browser:** `features/monitoring/browser-monitoring.tsx` loads `@sentry/browser` after hydration. It is configured by `NEXT_PUBLIC_SENTRY_DSN`, a Cloudflare build variable.
  - Page-load traces are sampled at 0.05, and trace propagation is limited to `/api/` so browser traces link to API traces.
  - Events go to `/api/monitoring/tunnel`, which relays raw envelopes (256 KB limit) only when the envelope's DSN matches `SENTRY_BROWSER_DSN`. The content security policy stays same-origin.
- **Scrubbing:** cookies, request bodies, query strings, all headers except user-agent, content-type and request ID, and user fields other than `id` are removed, including from breadcrumb URLs.
- **Docs and settings:** `docs/operations.md` ("Logs and error monitoring") gives setup and alert suggestions. `.env.example` and `render.yaml` list the settings, and the Privacy Policy lists an error monitoring provider.

## Validation

- `tests/monitoring.test.ts` (5): scrubbing removes every secret field, unexpected errors are reported with the request and account IDs, deliberate API errors are not, the relay does nothing when unconfigured, and it forwards byte for byte only to the configured project.
- The bundled server starts with a Sentry DSN, serves requests and logs `traceId` with each line.
- `pnpm audit`: no known vulnerabilities.

## Operator steps

Create two Sentry projects (Node.js and Browser JavaScript) on the free plan. Set `SENTRY_DSN`, `SENTRY_BROWSER_DSN` and `SENTRY_ENVIRONMENT` on Render, and `NEXT_PUBLIC_SENTRY_DSN` as a Cloudflare build variable. Then redeploy both.
