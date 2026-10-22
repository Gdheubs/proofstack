"use client";

import dynamic from "next/dynamic";

// Client-only, so the monitoring library stays out of the server Worker bundle.
export const MonitoringLoader = dynamic(
  () => import("./browser-monitoring").then((m) => m.BrowserMonitoring),
  { ssr: false },
);
