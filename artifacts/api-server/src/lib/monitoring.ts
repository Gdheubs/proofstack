import * as Sentry from "@sentry/node";
import type { ErrorEvent, NodeOptions } from "@sentry/node";

type TransactionEvent = Parameters<
  NonNullable<NodeOptions["beforeSendTransaction"]>
>[0];

// Error and performance monitoring. Off unless SENTRY_DSN is set. Events carry
// no cookies, auth headers, request bodies or query strings, and users are
// identified only by their internal account ID.
let enabled = false;

function sampleRate(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

type Scrubbable = Pick<ErrorEvent, "request" | "user" | "breadcrumbs">;
export function scrubEvent<T extends Scrubbable>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    const headers = event.request.headers ?? {};
    event.request.headers = Object.fromEntries(
      Object.entries(headers).filter(([name]) =>
        ["user-agent", "content-type", "x-request-id"].includes(
          name.toLowerCase(),
        ),
      ),
    );
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  event.breadcrumbs = event.breadcrumbs?.map((crumb) =>
    typeof crumb.data?.url === "string"
      ? { ...crumb, data: { ...crumb.data, url: crumb.data.url.split("?")[0] } }
      : crumb,
  );
  return event;
}

export function initMonitoring(service: string) {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || enabled) return enabled;
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.RENDER_GIT_COMMIT || undefined,
    serverName: service,
    initialScope: { tags: { service } },
    sendDefaultPii: false,
    tracesSampleRate: sampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
    beforeSendTransaction: (event: TransactionEvent) => scrubEvent(event),
  });
  enabled = true;
  return enabled;
}

export function monitoringEnabled() {
  return enabled;
}

// Reports an unexpected error with the request ID that the logs also carry.
export function captureError(
  error: unknown,
  context: { requestId?: string; userId?: string; code?: string } = {},
) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag("request_id", context.requestId);
    if (context.code) scope.setTag("error_code", context.code);
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(error);
  });
}

// The trace ID of the current request, so log lines can be matched to traces.
export function currentTraceId() {
  if (!enabled) return undefined;
  return Sentry.getActiveSpan()?.spanContext().traceId;
}

export async function flushMonitoring(timeoutMs = 2000) {
  if (enabled) await Sentry.flush(timeoutMs);
}
