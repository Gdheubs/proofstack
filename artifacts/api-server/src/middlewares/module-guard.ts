import type { RequestHandler } from "express";
import { ApiError } from "../lib/errors";
import { featureReady, type FeatureArea } from "../services/module-ready";

/** Fail closed unless the feature flag, key material, and every required module are ready. */
export function moduleGuard(area: FeatureArea): RequestHandler {
  return async (_req, _res, next) => {
    try {
      if (!(await featureReady(area)))
        return next(
          new ApiError(
            503,
            "FEATURE_UNAVAILABLE",
            "The requested feature is not configured",
          ),
        );
      return next();
    } catch {
      return next(
        new ApiError(
          503,
          "FEATURE_UNAVAILABLE",
          "The requested feature is not configured",
        ),
      );
    }
  };
}
