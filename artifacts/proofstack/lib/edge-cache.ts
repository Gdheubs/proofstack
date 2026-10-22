// Edge caching rules for API responses passing through the Worker. Only
// public, cookie-free responses to signed-out GET requests are stored, so a
// signed-in user's data can never be served to anyone else.
const SESSION_COOKIE = "__Host-ps-session=";

export function cacheableRequest(request: Request) {
  if (request.method !== "GET") return false;
  if (!new URL(request.url).pathname.startsWith("/api/")) return false;
  return !(request.headers.get("cookie") ?? "").includes(SESSION_COOKIE);
}

// The copy to store at the edge, or null when the response must not be kept.
export function edgeCopy(response: Response): Response | null {
  const control = response.headers.get("cache-control") ?? "";
  if (
    response.status !== 200 ||
    !/\bpublic\b/.test(control) ||
    !/\bs-maxage=\d+/.test(control) ||
    /\b(private|no-store)\b/.test(control) ||
    response.headers.has("set-cookie")
  )
    return null;
  const copy = response.clone();
  // The edge key is the URL alone; Vary is restored when the copy is served.
  const headers = new Headers(copy.headers);
  headers.delete("vary");
  return new Response(copy.body, { status: 200, headers });
}

export function fromEdge(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("vary", "Cookie");
  headers.set("x-edge-cache", "HIT");
  return new Response(response.body, { status: response.status, headers });
}
