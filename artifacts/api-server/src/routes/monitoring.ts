import { Router, type IRouter } from "express";

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
