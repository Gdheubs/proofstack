const fail = (step, status) => {
  throw new Error(
    `Development dependency not ready: ${step}${status ? ` (HTTP ${status})` : ""}`,
  );
};

/** Anonymous probes only; never log the response body or bootstrap identity. */
export async function verifyApiReadiness(origin, request = fetch) {
  for (const [path, label, valid] of [
    ["/api/healthz", "API liveness", (body) => body.status === "ok"],
    [
      "/api/readyz",
      "database/schema readiness",
      (body) => body.status === "ready",
    ],
    [
      "/api/auth/firebase/config",
      "authentication configuration",
      (body) => ["firebase", "supabase"].includes(body.provider),
    ],
    [
      "/api/auth/context",
      "anonymous session/CSRF configuration",
      (body) =>
        body.authenticated === false &&
        typeof body.csrfToken === "string" &&
        body.csrfToken.length > 0,
    ],
  ]) {
    let response;
    try {
      response = await request(`${origin}${path}`, {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      fail(label);
    }
    if (!response.ok) fail(label, response.status);
    let body;
    try {
      body = await response.json();
    } catch {
      fail(label);
    }
    if (!valid(body)) fail(label);
  }
}
