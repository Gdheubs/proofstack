"use client";

import { useEffect } from "react";

// Browser error and page-performance monitoring. Off unless
// NEXT_PUBLIC_SENTRY_DSN was set at build time. Reports go to our own API
// (/api/monitoring/tunnel), never directly to a third party, and carry no
// cookies, query strings or personal details.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const tracesSampleRate = Number(
  process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.05",
);
const withoutQuery = (url: string) => url.split("?")[0]!.split("#")[0]!;

let started = false;
export function BrowserMonitoring() {
  useEffect(() => {
    if (!dsn || started) return;
    started = true;
    // Loaded after the page is interactive, so it never delays first paint.
    void import("@sentry/browser").then((Sentry) =>
      Sentry.init({
        dsn,
        tunnel: "/api/monitoring/tunnel",
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
        sendDefaultPii: false,
        integrations: [Sentry.browserTracingIntegration()],
        tracesSampleRate:
          Number.isFinite(tracesSampleRate) && tracesSampleRate <= 1
            ? tracesSampleRate
            : 0.05,
        // Link browser traces to the API's traces for the same request.
        tracePropagationTargets: [/^\/api\//],
        beforeSend(event) {
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
            if (event.request.url)
              event.request.url = withoutQuery(event.request.url);
          }
          delete event.user;
          event.breadcrumbs = event.breadcrumbs?.map((crumb) =>
            typeof crumb.data?.url === "string"
              ? {
                  ...crumb,
                  data: { ...crumb.data, url: withoutQuery(crumb.data.url) },
                }
              : crumb,
          );
          return event;
        },
      }),
    );
  }, []);
  return null;
}
