import { z } from "zod";
import { ApiError } from "../lib/errors";
export const repoError = (message: string, status = 400) =>
  new ApiError(status, "REPOSITORY_ERROR", message);
export const uuid = z.string().uuid();
export const branchSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  .refine(
    (v) =>
      !v.includes("..") &&
      !v.includes("//") &&
      !v.endsWith("/") &&
      !v.endsWith(".") &&
      !v.split("/").some((p) => p.startsWith(".") || p.endsWith(".lock")),
    "Invalid branch name",
  );
export const pathSchema = z
  .string()
  .max(240)
  .refine(
    (v) =>
      Array.from(v).every((c) =>
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_. /()[]@+-".includes(
          c,
        ),
      ),
    "Unsupported file path characters",
  )
  .refine(
    (v) =>
      !v.startsWith("/") &&
      !v.endsWith("/") &&
      !v.includes("//") &&
      !v
        .split("/")
        .some(
          (p) =>
            p === "." ||
            p === ".." ||
            p.toLowerCase() === ".git" ||
            p.toLowerCase().startsWith(".git:") ||
            p.endsWith(".") ||
            p.endsWith(" "),
        ),
    "Use a safe relative file path",
  );
export const headSchema = z.string().regex(/^[0-9a-f]{40}$/);
export const repoActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), projectId: uuid }).strict(),
  z
    .object({
      action: z.literal("branch"),
      id: uuid,
      branch: branchSchema,
      from: branchSchema,
      expectedHead: headSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("commit"),
      id: uuid,
      branch: branchSchema,
      expectedHead: headSchema,
      path: pathSchema.refine((v) => v.length > 0),
      content: z.string().refine(
        (v) =>
          Buffer.byteLength(v, "utf8") <= 32768 &&
          Array.from(v).every((c) => {
            const n = c.charCodeAt(0);
            return (n >= 32 && n !== 127) || n === 9 || n === 10 || n === 13;
          }),
        "Use UTF-8 text up to 32 KiB without control characters",
      ),
      message: z
        .string()
        .trim()
        .min(3)
        .max(200)
        .refine(
          (v) =>
            Array.from(v).every(
              (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
            ),
          "Use a single-line commit message",
        ),
      remove: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal("token-create"),
      id: uuid,
      name: z.string().trim().min(1).max(60),
    })
    .strict(),
  z
    .object({ action: z.literal("token-revoke"), id: uuid, tokenId: uuid })
    .strict(),
]);
export function repoInput(raw: unknown) {
  const r = repoActionSchema.safeParse(raw);
  if (!r.success)
    throw repoError(r.error.issues[0]?.message ?? "Invalid action");
  return r.data;
}
export const repoQuerySchema = z
  .object({
    id: uuid.optional(),
    projectId: uuid.optional(),
    branch: branchSchema.optional(),
    revision: headSchema.optional(),
    path: pathSchema.default(""),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();
