import pino from "pino";
import { env } from "./env";

const isProduction = env.NODE_ENV === "production";

export const logger = pino({
  level: env.LOG_LEVEL,
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
