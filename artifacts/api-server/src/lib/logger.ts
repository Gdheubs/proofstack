import pino from "pino";
import { env } from "./env";
import { currentTraceId } from "./monitoring";

const isProduction = env.NODE_ENV === "production";

// Structured JSON logs. Every line names the service and, inside a monitored
// request, the trace ID that links it to the matching performance trace.
export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: process.env.SENTRY_SERVICE ?? "api",
    release: process.env.RENDER_GIT_COMMIT?.slice(0, 12),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const traceId = currentTraceId();
    return traceId ? { traceId } : {};
  },
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "password",
    "secret",
    "token",
    "connectionString",
    "DATABASE_URL",
    "*.password",
    "*.secret",
    "*.token",
    "*.encrypted_token",
    "*.access_token",
    "*.client_secret",
  ],
  ...(isProduction || env.NODE_ENV === "test"
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
