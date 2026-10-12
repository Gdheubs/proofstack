import { z } from "zod";
import { id, short, tags, proofIds, fail } from "./careers-policy";
import { linkSchema } from "./community-input";
export const careerActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("career-save"),
      headline: short(160),
      roles: tags,
      availability: z.enum(["open", "exploring", "closed"]),
      discoverable: z.boolean(),
      featuredProjects: proofIds,
    })
    .strict(),
  z
    .object({
      action: z.literal("job-save"),
      id: id.optional(),
      organizationId: id,
      title: short(160).min(3),
      description: short(12000).min(30),
      skills: tags,
      kind: z.enum(["job", "internship", "contract", "collaboration"]),
      workplace: z.enum(["remote", "hybrid", "onsite"]),
      location: short(160),
      compensation: short(160),
      status: z.enum(["draft", "open", "closed"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("apply"),
      jobId: id,
      note: short(5000).min(20),
      projectIds: proofIds.refine((v) => v.length > 0),
    })
    .strict(),
  z
    .object({
      action: z.literal("application-status"),
      id,
      status: z.enum([
        "reviewing",
        "shortlisted",
        "interview",
        "offered",
        "rejected",
        "withdrawn",
      ]),
    })
    .strict(),
  z
    .object({ action: z.literal("message"), id, body: short(4000).min(1) })
    .strict(),
  z
    .object({
      action: z.literal("issue-save"),
      id: id.optional(),
      projectId: id,
      title: short(160).min(3),
      description: short(6000),
      status: z.enum(["open", "in-progress", "done"]),
      assigneeId: id.nullable(),
      evidenceUrl: linkSchema,
    })
    .strict(),
]);
export function careerInput(raw: unknown) {
  const r = careerActionSchema.safeParse(raw);
  if (!r.success) throw fail(r.error.issues[0]?.message ?? "Invalid action");
  return r.data;
}
