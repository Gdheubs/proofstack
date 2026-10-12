import type { RequestHandler } from "express";
import { readSession, requireAccount } from "../services/auth-sessions";

/**
 * Reuse for future protected routes before tenant permission checks.
 * Never construct a principal from headers, body fields, or a decoded JWT alone.
 */
export const requireManagedIdentity: RequestHandler = async (
  req,
  res,
  next,
) => {
  requireAccount(await readSession(req, res));
  next();
};
