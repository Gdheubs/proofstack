import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { env } from "./lib/env";
import { trustedProxyClient } from "./lib/client-ip";
import { ApiError } from "./lib/errors";
import { errorHandler } from "./middlewares/error-handler";
import { apiRateLimit } from "./middlewares/rate-limit";
import { sendSmsHook } from "./routes/auth-sms";

import { requestMetrics } from "./services/operations";

const app: Express = express();
app.disable("x-powered-by");
// Only explicitly deployed proxy addresses may supply forwarding information.
app.set(
  "trust proxy",
  env.TRUST_PROXY_CIDRS.length ? env.TRUST_PROXY_CIDRS : false,
);
app.use(trustedProxyClient(env.PROXY_SHARED_SECRET));

app.use(
  pinoHttp({
    logger,
    genReqId: (_req, res) => {
      const id = randomUUID();
      res.setHeader("X-Request-ID", id);
      return id;
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(requestMetrics);
app.use(helmet());
app.use(
  cors({
    origin: (requestOrigin, callback) => {
      if (
        !requestOrigin ||
        env.CORS_ALLOWED_ORIGINS.includes(requestOrigin) ||
        requestOrigin === process.env.AUTH_APP_ORIGIN
      ) {
        callback(null, true);
        return;
      }
      callback(
        new ApiError(403, "ORIGIN_DENIED", "This origin is not permitted"),
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    exposedHeaders: [
      "X-Request-ID",
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
      "Retry-After",
    ],
    maxAge: 600,
  }),
);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
// Apply protection before parsing, including malformed and oversized requests.
app.use("/api", apiRateLimit);
app.use("/api", (req, _res, next) => {
  if (
    process.env.MAINTENANCE_MODE === "true" &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !req.path.startsWith("/auth/") &&
    !/^\/git\/[0-9a-f-]+\/git-upload-pack$/.test(req.path)
  )
    return next(
      new ApiError(
        503,
        "MAINTENANCE_MODE",
        "Changes are temporarily paused for maintenance",
      ),
    );
  next();
});
app.use(cookieParser());
// Signatures must be checked against the unmodified bytes, before JSON parsing.
app.post(
  "/api/auth/hooks/send-sms",
  express.raw({ type: "application/json", limit: "32kb", inflate: false }),
  sendSmsHook,
);
app.use(
  "/api/repositories/action",
  express.json({ limit: "4mb", strict: true, inflate: false }),
);
// A multi-file editor commit carries up to 5 MiB of file content.
app.use(
  "/api/editor/commit",
  express.json({ limit: "6mb", strict: true, inflate: false }),
);
app.use(express.json({ limit: "32kb", strict: true, inflate: false }));

app.use("/api", router);
app.use((_req, _res, next) =>
  next(new ApiError(404, "NOT_FOUND", "Route not found")),
);
app.use(errorHandler);

export default app;
