"use client";

import dynamic from "next/dynamic";

// The editor runs only in the browser, so it stays out of the server bundle.
export const EditorLoader = dynamic(
  () => import("./workbench").then((m) => m.Workbench),
  {
    ssr: false,
    loading: () => <p className="p-6 text-sm">Loading the editor…</p>,
  },
);
