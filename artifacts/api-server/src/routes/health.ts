import { Router, type IRouter } from "express";
import {
  HealthCheckResponse,
  ReadinessCheckResponse,
} from "@workspace/api-zod";
import { checkReadiness } from "../services/health";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.setHeader("Cache-Control", "no-store");
  res.json(data);
});

router.get("/readyz", async (req, res): Promise<void> => {
  const data = ReadinessCheckResponse.parse(await checkReadiness());
  if (data.status !== "ready") req.log.warn("Database readiness check failed");
  res.setHeader("Cache-Control", "no-store");
  res.status(data.status === "ready" ? 200 : 503).json(data);
});

export default router;
