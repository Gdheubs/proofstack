// Pure helpers for running code from the editor. The code itself runs in the
// sealed runner and preview pages under public/runner (see public/_headers).
export type RunKind = "python" | "javascript" | "typescript" | "html";
export type RunStatus =
  | "idle"
  | "loading"
  | "running"
  | "ok"
  | "error"
  | "timeout"
  | "stopped"
  | "limit";

const KINDS: Record<string, RunKind> = {
  py: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  html: "html",
  htm: "html",
};
export function runKind(path: string): RunKind | null {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  return path.includes(".") ? (KINDS[extension] ?? null) : null;
}

// "a/b/c.html" + "../d.css" -> "a/d.css"; null for absolute, protocol,
// protocol-relative or fragment references.
export function resolvePath(from: string, ref: string): string | null {
  if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return null;
  const clean = ref.split(/[?#]/)[0]!;
  const parts = clean.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of clean.replace(/^\//, "").split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

// src and href attribute values in a page, in document order.
export function htmlReferences(html: string): string[] {
  const found: string[] = [];
  const pattern = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const match of html.matchAll(pattern))
    found.push((match[1] ?? match[2] ?? match[3] ?? "").trim());
  return found.filter(Boolean);
}

// Text files a page needs: the stylesheets, scripts and data it links to
// that exist in the repository.
const PAGE_ASSETS = /\.(?:css|js|mjs|json|svg)$/i;
export function pageFiles(entry: string, html: string, paths: Set<string>) {
  const wanted = new Set<string>();
  for (const ref of htmlReferences(html)) {
    const path = resolvePath(entry, ref);
    if (path && PAGE_ASSETS.test(path) && paths.has(path)) wanted.add(path);
  }
  return [...wanted];
}

// The Python files a program may import: every .py file when there are few,
// otherwise those next to and below the program's own folder.
export const MAX_PYTHON_FILES = 60;
export function pythonFiles(paths: string[], entry: string): string[] {
  const all = paths.filter((p) => p.endsWith(".py"));
  if (all.length <= MAX_PYTHON_FILES) return all;
  const folder = entry.includes("/")
    ? entry.slice(0, entry.lastIndexOf("/") + 1)
    : "";
  return all
    .filter((p) => p.startsWith(folder))
    .sort((a, b) => a.split("/").length - b.split("/").length)
    .slice(0, MAX_PYTHON_FILES);
}

// JavaScript runs as one file; imports between repository files are not
// resolved yet.
export function hasRelativeImport(code: string) {
  return /(?:^|[\s;])(?:import|export)\b[^'"`]*?\bfrom\s*['"]\.{1,2}\/|\bimport\s*\(\s*['"]\.{1,2}\/|^\s*import\s*['"]\.{1,2}\//m.test(
    code,
  );
}

// Images in a previewed GitHub page load from the repository's public raw
// address (works for public repositories).
export function rawAssetBase(source: string, repo: string, branch: string) {
  if (source !== "github" || !repo || !branch) return "";
  return `https://raw.githubusercontent.com/${repo}/${branch
    .split("/")
    .map(encodeURIComponent)
    .join("/")}/`;
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  idle: "",
  loading: "Starting…",
  running: "Running…",
  ok: "Finished",
  error: "Finished with an error",
  timeout: "Stopped after 10 seconds",
  stopped: "Stopped",
  limit: "Stopped: output limit reached",
};
