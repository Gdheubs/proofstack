import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { rateLimitAddress } from "../lib/client-ip";
import { consumeRateLimit } from "../services/rate-limit";

// Browser error reports are posted here and relayed to the configured
// monitoring project, so the browser never contacts a third-party host and
// the site's content security policy stays same-origin.
const router: IRouter = Router();

function target() {
  const raw = (
    process.env.SENTRY_BROWSER_DSN || process.env.SENTRY_DSN
  )?.trim();
  if (!raw) return null;
  try {
    const dsn = new URL(raw);
    const project = dsn.pathname.replace(/^\/+/, "");
    if (dsn.protocol !== "https:" || !/^\d+$/.test(project)) return null;
    return { host: dsn.host, project };
  } catch {
    return null;
  }
}

router.post("/monitoring/tunnel", async (req, res): Promise<void> => {
  const expected = target();
  const body = Buffer.isBuffer(req.body) ? req.body : null;
  if (!expected || !body?.length) {
    res.status(204).end();
    return;
  }
  // A browser sends a handful of reports; more is someone using this relay
  // to flood the monitoring project. Extra reports are dropped quietly.
  try {
    const address = createHash("sha256")
      .update(rateLimitAddress(req))
      .digest("hex");
    if (!(await consumeRateLimit(`monitoring:${address}`, 600, 30)).allowed) {
      res.status(429).end();
      return;
    }
  } catch {
    res.status(204).end();
    return;
  }
  // The envelope's first line names the DSN it is meant for; relay only to ours.
  try {
    const header = JSON.parse(body.subarray(0, body.indexOf(10)).toString());
    const dsn = new URL(header.dsn);
    if (
      dsn.host !== expected.host ||
      dsn.pathname.replace(/^\/+/, "") !== expected.project
    ) {
      res.status(400).end();
      return;
    }
  } catch {
    res.status(400).end();
    return;
  }
  try {
    const upstream = await fetch(
      `https://${expected.host}/api/${expected.project}/envelope/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope" },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      },
    );
    res.status(upstream.ok ? 200 : 502).end();
  } catch {
    res.status(502).end();
  }
});

export default router;
