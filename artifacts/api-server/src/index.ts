import app from "./app";
import { configureHttpServer } from "./lib/transport";
import { logger } from "./lib/logger";
import { env } from "./lib/env";
import { pool } from "@workspace/db";
import { pruneRateLimitBuckets } from "./services/rate-limit";

const server = app.listen(env.PORT, env.BIND_HOST, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port: env.PORT }, "Server listening");
});

configureHttpServer(server);

const housekeeping = setInterval(
  () => {
    void pruneRateLimitBuckets().catch(() =>
      logger.warn("Rate limit housekeeping failed"),
    );
  },
  15 * 60 * 1000,
).unref();

function shutdown(signal: string) {
  logger.info({ signal }, "Graceful shutdown started");
  clearInterval(housekeeping);
  const timeout = setTimeout(() => process.exit(1), 80000).unref();
  server.close(() => {
    void pool.end().then(() => {
      clearTimeout(timeout);
      process.exit(0);
    });
  });
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
