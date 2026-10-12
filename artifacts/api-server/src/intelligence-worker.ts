import { randomUUID } from "node:crypto";
import { workerHeartbeat } from "./services/operations";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { intelligenceEnabled } from "./services/intelligence-input";
import {
  runIntelligenceOnce,
  pruneIntelligenceJobs,
} from "./services/intelligence-worker";
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    stopping = true;
    setTimeout(() => process.exit(1), 80000).unref();
  });
async function main() {
  if (!intelligenceEnabled())
    throw new Error(
      "Set INTELLIGENCE_ENABLED=true before starting the intelligence worker.",
    );
  logger.info("Intelligence worker started");
  let lastPrune = 0;
  const workerId = randomUUID();
  while (!stopping) {
    try {
      await workerHeartbeat(workerId);
      if (Date.now() - lastPrune > 3600000) {
        await pruneIntelligenceJobs();
        lastPrune = Date.now();
      }
      if (await runIntelligenceOnce()) continue;
    } catch {
      logger.warn("Intelligence worker iteration failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  await pool.query("DELETE FROM service_heartbeats WHERE id=$1", [workerId]);
  await pool.end();
}
main().catch(() => {
  logger.error("Intelligence worker could not start");
  process.exitCode = 1;
  void pool.end();
});
