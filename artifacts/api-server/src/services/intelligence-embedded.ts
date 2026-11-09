import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger";
import { intelligenceEnabled } from "./intelligence-input";
import { workerHeartbeat } from "./operations";
import {
  pruneIntelligenceJobs,
  runIntelligenceOnce,
} from "./intelligence-worker";

// Hosting without background workers (Render Free) can run the intelligence
// worker inside the API process: EMBEDDED_WORKERS=intelligence. It works on
// demand, never on a timer: a request or a status check starts a drain of the
// due jobs, which ends when none are left. A timer polling the database every
// few seconds would keep a scale-to-zero database awake all month.
export const embeddedIntelligence = () =>
  intelligenceEnabled() &&
  (process.env.EMBEDDED_WORKERS ?? "")
    .split(",")
    .map((name) => name.trim())
    .includes("intelligence");

const workerId = randomUUID();
let draining: Promise<void> | null = null;
let again = false;
let lastPrune = 0;
const MAX_JOBS_PER_DRAIN = 50;

async function drain() {
  do {
    again = false;
    await workerHeartbeat(workerId);
    if (Date.now() - lastPrune > 3600000) {
      await pruneIntelligenceJobs();
      lastPrune = Date.now();
    }
    for (
      let n = 0;
      n < MAX_JOBS_PER_DRAIN && (await runIntelligenceOnce());
      n++
    );
  } while (again);
}

// Starts a drain unless one is running, in which case it runs once more.
// Returns the drain so tests and shutdown can wait for it.
export function kickIntelligence(): Promise<void> {
  if (!embeddedIntelligence()) return Promise.resolve();
  if (draining) {
    again = true;
    return draining;
  }
  draining = drain()
    .catch(() => logger.warn("Embedded intelligence worker iteration failed"))
    .finally(() => {
      draining = null;
    });
  return draining;
}
