// Upstream headers that only reveal which hosting provider runs the API.
export const HIDDEN_RESPONSE_HEADERS = [
  "rndr-id",
  "x-render-origin-server",
  "x-powered-by",
  "server-timing",
  "x-opennext",
];

export function withoutHostingHeaders(response: Response): Response {
  if (!HIDDEN_RESPONSE_HEADERS.some((name) => response.headers.has(name)))
    return response;
  const headers = new Headers(response.headers);
  for (const name of HIDDEN_RESPONSE_HEADERS) headers.delete(name);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
