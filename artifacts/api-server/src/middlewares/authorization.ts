import type { RequestHandler, Request } from "express";
import { z } from "zod/v4";
import { ApiError } from "../lib/errors";
import { hasPermission } from "../services/authorization";
import "../types/auth";

export const requireAuthenticated: RequestHandler = (_req, res, next) => {
  if (!res.locals.principal) {
    next(
      new ApiError(
        401,
        "AUTHENTICATION_REQUIRED",
        "A verified session is required",
      ),
    );
    return;
  }
  next();
};

export function requirePermission(
  permission: string,
  organizationId: (request: Request) => unknown,
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const principal = res.locals.principal;
    if (!principal) {
      next(
        new ApiError(
          401,
          "AUTHENTICATION_REQUIRED",
          "A verified session is required",
        ),
      );
      return;
    }
    const parsed = z.uuid().safeParse(organizationId(req));
    if (!parsed.success) {
      next(
        new ApiError(
          400,
          "INVALID_ORGANIZATION",
          "A valid organization identifier is required",
        ),
      );
      return;
    }
    const granted = await hasPermission({
      userId: principal.userId,
      organizationId: parsed.data,
      permission,
    });
    if (!granted) {
      req.log.warn({ permission }, "Permission denied");
      next(
        new ApiError(
          403,
          "PERMISSION_DENIED",
          "You do not have permission for this organization",
        ),
      );
      return;
    }
    next();
  };
}
