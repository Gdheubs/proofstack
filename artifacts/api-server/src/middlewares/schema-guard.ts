import type { RequestHandler } from "express";
import { ApiError } from "../lib/errors";
import { checkReadiness } from "../services/health";

// If the API is deployed before its database migrations have run, requests
// would fail part-way (for example during sign-in). Until the database has
// every table and column this code uses, answer with a clear 503 instead.
let state: { ready: boolean; until: number } = { ready: false, until: 0 };
let pending: Promise<boolean> | null = null;

async function schemaReady(): Promise<boolean> {
  if (Date.now() < state.until) return state.ready;
  pending ??= checkReadiness()
    .then((r) => {
      const ready = r.status === "ready";
      // Re-check soon while not ready, rarely once it is.
      state = { ready, until: Date.now() + (ready ? 300000 : 5000) };
      return ready;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export const schemaGuard: RequestHandler = async (req, _res, next) => {
  // Only production can be deployed ahead of its migrations; development and
  // tests migrate with migrate:dev.
  if (process.env.NODE_ENV !== "production") return next();
  if (req.path === "/healthz" || req.path === "/readyz") return next();
  if (await schemaReady()) return next();
  next(
    new ApiError(
      503,
      "SERVICE_UPDATING",
      "ProofStack is being updated. Please try again in a few minutes",
    ),
  );
};

// Tests reset the cached result between scenarios.
export function resetSchemaGuard() {
  state = { ready: false, until: 0 };
}
