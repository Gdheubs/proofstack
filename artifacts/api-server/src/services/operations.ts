import { pool } from "@workspace/db";
import type { RequestHandler } from "express";
import { performance } from "node:perf_hooks";
import { ApiError } from "../lib/errors";
import { requireFresh, type AuthSession } from "./auth-sessions";
import {
  intelligenceAiEnabled,
  intelligenceEnabled,
} from "./intelligence-input";
import { storageEnabled } from "./repository-git";
let requests = 0,
  inFlight = 0,
  errors = 0;
const durations: number[] = [];
export const requestMetrics: RequestHandler = (_req, res, next) => {
  const start = performance.now();
  inFlight++;
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    inFlight--;
    requests++;
    if (res.statusCode >= 500) errors++;
    durations.push(performance.now() - start);
    if (durations.length > 256) durations.shift();
  };
  res.once("finish", complete);
  res.once("close", complete);
  next();
};
export async function workerHeartbeat(id: string) {
  await pool.query(
    "INSERT INTO service_heartbeats(id,service,last_seen_at) VALUES($1,'intelligence',clock_timestamp()) ON CONFLICT(id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at",
    [id],
  );
}
export async function getOperations(s: AuthSession) {
  requireFresh(s, true);
  const actor = await pool.query(
    "SELECT 1 FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND u.status='active' AND u.platform_role IN ('admin','super_admin') AND s.revoked_at IS NULL AND s.expires_at>now()",
    [s.user.id, s.row.id],
  );
  if (!actor.rows.length)
    throw new ApiError(
      403,
      "OPERATIONS_FORBIDDEN",
      "Operations is restricted to active platform administrators",
    );
  const q = (
    await pool.query(
      `SELECT count(*) FILTER (WHERE status='queued')::int AS queued,count(*) FILTER (WHERE status='running')::int AS running,count(*) FILTER (WHERE status='failed' AND finished_at>now()-interval '1 day')::int AS failed,coalesce(extract(epoch FROM now()-min(created_at) FILTER (WHERE status='queued')),0)::float8 AS oldest FROM intelligence_jobs WHERE status IN ('queued','running') OR (status='failed' AND finished_at>now()-interval '1 day')`,
    )
  ).rows[0];
  const workers = (
    await pool.query(
      "SELECT count(*)::int AS n FROM service_heartbeats WHERE service='intelligence' AND last_seen_at>now()-interval '180 seconds'",
    )
  ).rows[0].n;
  const sorted = [...durations].sort((a, b) => a - b);
  const configuration = {
    maintenance: process.env.MAINTENANCE_MODE === "true",
    gitEnabled: storageEnabled(),
    intelligenceEnabled: intelligenceEnabled(),
    aiEnabled: intelligenceAiEnabled(),
  };
  const alerts: string[] = [];
  if (configuration.maintenance)
    alerts.push(
      "Product changes and new worker claims are paused for maintenance.",
    );
  if (configuration.intelligenceEnabled && workers === 0)
    alerts.push("No intelligence worker heartbeat in the last 180 seconds.");
  if (q.oldest > 300)
    alerts.push("The oldest queued job has waited more than five minutes.");
  if (q.failed > 0)
    alerts.push(
      `${q.failed} intelligence jobs failed in the last 24 hours. Review job status and provider billing before retrying.`,
    );
  if (pool.waitingCount > 0)
    alerts.push("Database clients are waiting for a pooled connection.");
  return {
    checkedAt: new Date().toISOString(),
    runtime: {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      requests,
      inFlight,
      errors,
      latencyP95Ms: Math.round(
        sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
      ),
      dbWaiting: pool.waitingCount ?? 0,
    },
    queue: {
      queued: q.queued,
      running: q.running,
      failed: q.failed,
      oldestQueuedSeconds: Math.round(q.oldest),
      workers,
    },
    configuration,
    alerts,
  };
}
