import { z } from "zod/v3";
import { ApiError } from "../lib/errors";
import { uuid, branchSchema, headSchema } from "./repository-input";
export const intelligenceEnabled = () =>
  process.env.INTELLIGENCE_ENABLED === "true";
export const intelligenceAiEnabled = () =>
  intelligenceEnabled() &&
  !!process.env.INTELLIGENCE_AI_MODEL &&
  !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
  !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
export const intelligenceError = (message: string, status = 400) =>
  new ApiError(status, "INTELLIGENCE_REJECTED", message);
export const intelligenceInput = z.union([
  z
    .object({
      action: z.literal("enqueue"),
      kind: z.literal("opportunities"),
      requestKey: uuid,
      workplace: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
    })
    .strict(),
  z
    .object({
      action: z.literal("enqueue"),
      kind: z.literal("career-plan"),
      requestKey: uuid,
      jobId: uuid,
      consent: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("enqueue"),
      kind: z.literal("security-scan"),
      requestKey: uuid,
      repositoryId: uuid,
      branch: branchSchema,
      expectedHead: headSchema,
    })
    .strict(),
  z
    .object({ action: z.enum(["cancel", "review", "delete"]), id: uuid })
    .strict(),
]);
export type IntelligenceInput = z.infer<typeof intelligenceInput>;
export const intelligenceQuery = z
  .object({
    id: uuid.optional(),
    kind: z.enum(["opportunities", "career-plan", "security-scan"]).optional(),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();
export const planSchema = z
  .object({
    summary: z.string().min(1).max(1500),
    steps: z
      .array(
        z
          .object({
            title: z.string().min(1).max(120),
            objective: z.string().min(1).max(800),
            exercise: z.string().min(1).max(1200),
            evidence: z.string().min(1).max(600),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();
