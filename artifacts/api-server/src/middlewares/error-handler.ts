import type { ErrorRequestHandler } from "express";
import { ApiError } from "../lib/errors";
import { captureError } from "../lib/monitoring";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  _next,
) => {
  if (res.headersSent) {
    _next(error);
    return;
  }
  let safe =
    error instanceof ApiError
      ? error
      : new ApiError(
          500,
          "INTERNAL_ERROR",
          "The request could not be completed",
        );
  if (error && typeof error === "object" && "type" in error) {
    if (error.type === "encoding.unsupported")
      safe = new ApiError(
        415,
        "ENCODING_UNSUPPORTED",
        "Compressed request bodies are not supported",
      );
    if (error.type === "entity.parse.failed")
      safe = new ApiError(400, "INVALID_JSON", "Malformed JSON request body");
    if (error.type === "entity.too.large")
      safe = new ApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        "Request body exceeds the allowed size",
      );
  }
  // Unexpected failures (not deliberate API errors) go to error monitoring.
  if (!(error instanceof ApiError) && safe.status >= 500)
    captureError(error, {
      requestId: String(req.id),
      userId: res.locals?.principal?.userId,
      code: safe.code,
    });
  if (safe.status >= 500) {
    req.log.error(
      {
        errorType: error instanceof Error ? error.name : "UnknownError",
        code: safe.code,
      },
      "Request failed",
    );
  }
  res.set("Cache-Control", "private, no-store");
  res.status(safe.status).json({
    error: { code: safe.code, message: safe.message },
    requestId: String(req.id),
  });
};
