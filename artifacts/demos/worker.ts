// ProofStack demo site: serves published demos at /<handle>/<repository>/…
// from R2. It runs on its own address, separate from ProofStack, so a demo's
// scripts can never read ProofStack cookies or act as a visitor there. It
// only ever reads objects under DEMO_PREFIX; nothing is listed or written.

// The few R2 binding members this Worker uses (no type package needed).
type R2Body = {
  body: ReadableStream;
  size: number;
  httpEtag: string;
  text(): Promise<string>;
};
type R2Bucket = { get(key: string): Promise<R2Body | null> };
export type Env = { DEMOS: R2Bucket; DEMO_PREFIX: string };

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  wasm: "application/wasm",
  xml: "application/xml",
  pdf: "application/pdf",
};
// Only these types are served; anything else (programs, archives) is 404.
export const contentType = (path: string): string | null =>
  TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? null;

// A demo lives under <prefix>/<handle>/<repo>/: "current" names the live
// version, whose files are under v/<version>/.
export type Resolved =
  | { kind: "file"; base: string; path: string; type: string }
  | { kind: "redirect"; location: string }
  | { kind: "home" }
  | { kind: "missing" };

// Maps a request path to an object key under the prefix, or says why not.
export function resolve(pathname: string, prefix: string): Resolved {
  if (pathname === "/" || pathname === "") return { kind: "home" };
  let parts: string[];
  try {
    parts = pathname.split("/").slice(1).map(decodeURIComponent);
  } catch {
    return { kind: "missing" };
  }
  const [handle, repo, ...rest] = parts;
  if (!handle || !repo || !SEGMENT.test(handle) || !SEGMENT.test(repo))
    return { kind: "missing" };
  // /<handle>/<repo> → /<handle>/<repo>/ so relative links resolve.
  if (parts.length === 2) return { kind: "redirect", location: `${pathname}/` };
  if (
    rest.some(
      (p, i) =>
        p === "." ||
        p === ".." ||
        p.includes("\\") ||
        p.includes("\0") ||
        (p === "" && i !== rest.length - 1),
    )
  )
    return { kind: "missing" };
  const file = rest.join("/");
  const path = file === "" || file.endsWith("/") ? `${file}index.html` : file;
  const type = contentType(path);
  if (!type) return { kind: "missing" };
  return {
    kind: "file",
    base: `${prefix}/${handle.toLowerCase()}/${repo.toLowerCase()}/`,
    path,
    type,
  };
}

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Demos are not for search engines and cannot be framed by other sites.
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "frame-ancestors 'self'",
};
const page = (status: number, title: string, body: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>${title}</h1><p>${body}</p>`,
    {
      status,
      headers: {
        ...HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    },
  );

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...HEADERS, Allow: "GET, HEAD" },
      });
    const url = new URL(request.url);
    const target = resolve(url.pathname, env.DEMO_PREFIX);
    if (target.kind === "home")
      return page(
        200,
        "ProofStack demos",
        "Live demos of projects published on ProofStack. Open a demo from its project page.",
      );
    if (target.kind === "redirect")
      return new Response(null, {
        status: 301,
        headers: { ...HEADERS, Location: target.location + url.search },
      });
    let object: R2Body | null = null;
    if (target.kind === "file") {
      const current = await env.DEMOS.get(`${target.base}current`);
      const version = current ? (await current.text()).trim() : "";
      if (/^[a-z0-9-]{1,40}$/.test(version))
        object = await env.DEMOS.get(
          `${target.base}v/${version}/${target.path}`,
        );
      // Demos published before versions existed have no "current".
      else if (!current)
        object = await env.DEMOS.get(`${target.base}${target.path}`);
    }
    if (!object || target.kind !== "file")
      return page(
        404,
        "Demo not found",
        "This demo does not exist, was unpublished, or this page is not part of it.",
      );
    return new Response(request.method === "HEAD" ? null : object.body, {
      headers: {
        ...HEADERS,
        "Content-Type": target.type,
        "Content-Length": String(object.size),
        ETag: object.httpEtag,
        // Short cache: a re-published demo shows within a minute.
        "Cache-Control": "public, max-age=60",
      },
    });
  },
};
