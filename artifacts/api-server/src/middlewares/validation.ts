import type { RequestHandler } from "express";
import type { ZodType } from "zod/v4";
import { ApiError } from "../lib/errors";

export function validateBody(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(
        new ApiError(
          400,
          "VALIDATION_ERROR",
          "Request body did not match the input contract",
        ),
      );
      return;
    }
    res.locals.validatedBody = parsed.data;
    next();
  };
}
