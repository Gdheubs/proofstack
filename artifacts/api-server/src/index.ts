import "./instrument";
import app from "./app";
import { configureHttpServer } from "./lib/transport";
import { logger } from "./lib/logger";
import { env } from "./lib/env";
import { pool } from "@workspace/db";
import { flushMonitoring } from "./lib/monitoring";

const server = app.listen(env.PORT, env.BIND_HOST, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port: env.PORT }, "Server listening");
});

configureHttpServer(server);

function shutdown(signal: string) {
  logger.info({ signal }, "Graceful shutdown started");
  const timeout = setTimeout(() => process.exit(1), 80000).unref();
  server.close(() => {
    void Promise.all([pool.end(), flushMonitoring()]).then(() => {
      clearTimeout(timeout);
      process.exit(0);
    });
  });
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
