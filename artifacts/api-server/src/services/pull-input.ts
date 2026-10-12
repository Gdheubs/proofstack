import { z } from "zod";
import { uuid, branchSchema, headSchema, repoError } from "./repository-input";
const text = (max: number) => z.string().trim().max(max);
export const releaseTag = z
  .string()
  .max(80)
  .regex(/^v?[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/);
export const pullActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("open"),
      repositoryId: uuid,
      title: text(160).min(3),
      body: text(8000),
      sourceBranch: branchSchema,
      targetBranch: branchSchema,
      draft: z.boolean(),
      issueId: uuid.nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("state"),
      id: uuid,
      status: z.enum(["open", "closed"]),
    })
    .strict(),
  z
    .object({ action: z.literal("comment"), id: uuid, body: text(4000).min(1) })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      id: uuid,
      sourceHead: headSchema,
      targetHead: headSchema,
      decision: z.enum(["approved", "changes-requested"]),
      body: text(4000),
    })
    .strict(),
  z
    .object({
      action: z.literal("check"),
      id: uuid,
      sourceHead: headSchema,
      targetHead: headSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("merge"),
      id: uuid,
      sourceHead: headSchema,
      targetHead: headSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("release"),
      repositoryId: uuid,
      commit: headSchema,
      tag: releaseTag,
      title: text(160).min(3),
      notes: text(10000),
    })
    .strict(),
]);
export function pullInput(raw: unknown) {
  const r = pullActionSchema.safeParse(raw);
  if (!r.success)
    throw repoError(
      r.error.issues[0]?.message ?? "Invalid pull request action",
    );
  return r.data;
}
export const pullQuery = z
  .object({
    repositoryId: uuid.optional(),
    id: uuid.optional(),
    status: z.enum(["all", "open", "draft", "closed", "merged"]).default("all"),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
    view: z.enum(["pulls", "releases"]).default("pulls"),
  })
  .strict()
  .refine(
    (d) => !!d.repositoryId || !!d.id,
    "Repository or pull request required",
  );
