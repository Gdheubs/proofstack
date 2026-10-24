import { z } from "zod/v3";
import { NOTIFICATION_CATEGORIES } from "./notification-preferences";
import { ApiError } from "../lib/errors";
const id = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
export const handleSchema = text(32)
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_-]{2,31}$/,
    "Use 3–32 lowercase letters, numbers, underscores or hyphens",
  )
  .refine(
    (v) =>
      ![
        "me",
        "settings",
        "new",
        "edit",
        "admin",
        "api",
        "auth",
        "account",
        "search",
        "community",
      ].includes(v),
    "This handle is reserved",
  );
export const slugSchema = text(70)
  .toLowerCase()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use letters, numbers and single hyphens",
  )
  .refine(
    (v) => !["new", "edit", "settings"].includes(v),
    "This slug is reserved",
  );
export const linkSchema = text(2000).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Use a full HTTPS URL without credentials");
const tags = z
  .array(text(60).min(1))
  .max(30)
  .transform((v) => [...new Map(v.map((s) => [s.toLowerCase(), s])).values()]);
const assetPath = text(150).regex(
  /^$|^\/api\/community\/assets\/[a-f0-9-]{36}$/,
  "Upload an image first",
);
const date = text(10).refine(
  (v) =>
    !v ||
    (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(new Date(v).getTime()) &&
      new Date(v).toISOString().slice(0, 10) === v),
  "Use a valid YYYY-MM-DD date",
);
const entries = [
  "experience",
  "repository",
  "contribution",
  "achievement",
  "challenge",
  "evidence",
  "release",
  "documentation",
] as const;
const scope = {
  projectId: id.nullable().optional(),
  organizationId: id.nullable().optional(),
};
const schemas = {
  "profile-save": z.object({
    action: z.literal("profile-save"),
    handle: handleSchema,
    displayName: text(160).min(1),
    bio: text(4000).default(""),
    location: text(160).default(""),
    skills: tags.default([]),
    avatarPath: assetPath.optional(),
    headline: text(160).default(""),
    links: z
      .object({
        website: linkSchema.default(""),
        github: linkSchema.default(""),
        linkedin: linkSchema.default(""),
      })
      .strict()
      .default({ website: "", github: "", linkedin: "" }),
  }),
  "onboarding-complete": z.object({ action: z.literal("onboarding-complete") }),
  "notification-preferences-save": z.object({
    action: z.literal("notification-preferences-save"),
    preferences: z
      .object(
        Object.fromEntries(
          NOTIFICATION_CATEGORIES.map((c) => [
            c,
            z.object({ inApp: z.boolean(), email: z.boolean() }).strict(),
          ]),
        ),
      )
      .strict(),
  }),
  "privacy-save": z.object({
    action: z.literal("privacy-save"),
    profileVisibility: z.enum(["public", "members"]),
  }),
  "entry-save": z
    .object({
      action: z.literal("entry-save"),
      id: id.optional(),
      ...scope,
      kind: z.enum(entries),
      title: text(200).min(1),
      description: text(20000).default(""),
      url: linkSchema.default(""),
      subtitle: text(200).default(""),
      technologies: tags.default([]),
      startDate: date.default(""),
      endDate: date.default(""),
      version: text(80).default(""),
      aiAssisted: z.boolean().default(false),
    })
    .refine(
      (v) => !v.projectId || !v.organizationId,
      "Select only one record scope",
    )
    .refine(
      (v) => !v.startDate || !v.endDate || v.startDate <= v.endDate,
      "End date must follow start date",
    ),
  "entry-delete": z.object({ action: z.literal("entry-delete"), id }),
  follow: z.object({
    action: z.literal("follow"),
    targetId: id,
    enabled: z.boolean(),
  }),
  "post-save": z.object({
    action: z.literal("post-save"),
    id: id.optional(),
    body: text(5000).min(1),
    tags: tags.default([]),
    projectId: id.nullable().optional(),
  }),
  "post-delete": z.object({ action: z.literal("post-delete"), id }),
  "comment-save": z.object({
    action: z.literal("comment-save"),
    id: id.optional(),
    targetId: id,
    body: text(2000).min(1),
  }),
  "comment-delete": z.object({ action: z.literal("comment-delete"), id }),
  reaction: z.object({
    action: z.literal("reaction"),
    targetType: z.enum(["post", "comment"]),
    targetId: id,
    kind: z.enum(["like", "insightful", "celebrate"]),
    enabled: z.boolean(),
  }),
  bookmark: z.object({
    action: z.literal("bookmark"),
    targetType: z.enum(["post", "project"]),
    targetId: id,
    enabled: z.boolean(),
  }),
  "project-save": z.object({
    action: z.literal("project-save"),
    id: id.optional(),
    slug: slugSchema,
    title: text(200).min(1),
    description: text(20000).min(1),
    technologies: tags.default([]),
    screenshots: z.array(assetPath.min(1)).max(10).default([]),
    demoUrl: linkSchema.default(""),
    repositoryUrl: linkSchema.default(""),
    visibility: z.enum(["public", "organization"]).default("public"),
    organizationId: id.nullable().default(null),
  }),
  "project-delete": z.object({ action: z.literal("project-delete"), id }),
  "contributor-invite": z.object({
    action: z.literal("contributor-invite"),
    projectId: id,
    handle: handleSchema,
  }),
  "contributor-respond": z.object({
    action: z.literal("contributor-respond"),
    projectId: id,
    accept: z.boolean(),
  }),
  "contributor-remove": z.object({
    action: z.literal("contributor-remove"),
    projectId: id,
    targetId: id,
  }),
  "organization-save": z.object({
    action: z.literal("organization-save"),
    id: id.optional(),
    name: text(160).min(1),
    slug: slugSchema,
    description: text(4000).default(""),
    website: linkSchema.default(""),
    visibility: z.enum(["public", "private"]).default("public"),
  }),
  "organization-delete": z.object({
    action: z.literal("organization-delete"),
    id,
  }),
  "member-save": z.object({
    action: z.literal("member-save"),
    organizationId: id,
    handle: handleSchema,
    role: z.enum([
      "organization_owner",
      "organization_admin",
      "organization_member",
    ]),
  }),
  "member-remove": z.object({
    action: z.literal("member-remove"),
    organizationId: id,
    targetId: id,
  }),
  "member-respond": z.object({
    action: z.literal("member-respond"),
    organizationId: id,
    accept: z.boolean(),
  }),
  "team-save": z.object({
    action: z.literal("team-save"),
    id: id.optional(),
    organizationId: id,
    name: text(100).min(1),
    description: text(2000).default(""),
  }),
  "team-delete": z.object({ action: z.literal("team-delete"), id }),
  "team-member": z.object({
    action: z.literal("team-member"),
    id,
    targetId: id,
    enabled: z.boolean(),
  }),
  "notification-read": z.object({
    action: z.literal("notification-read"),
    id: id.optional(),
  }),
  "asset-complete": z.object({ action: z.literal("asset-complete"), id }),
  "asset-delete": z.object({ action: z.literal("asset-delete"), id }),
};
type Schemas = typeof schemas;
export type CommunityAction = {
  [K in keyof Schemas]: z.infer<Schemas[K]>;
}[keyof Schemas];
export function parseCommunityAction(body: unknown): CommunityAction {
  if (
    !body ||
    typeof body !== "object" ||
    !("action" in body) ||
    typeof body.action !== "string" ||
    !Object.hasOwn(schemas, body.action)
  )
    throw new ApiError(
      400,
      "INVALID_COMMUNITY_INPUT",
      "Choose a supported community action",
    );
  const action = body.action as keyof Schemas;
  const result = schemas[action].safeParse(body);
  if (!result.success)
    throw new ApiError(
      400,
      "INVALID_COMMUNITY_INPUT",
      result.error.issues[0]?.message || "Invalid input",
    );
  // Effects-based schemas retain the same set of keys; reject fields instead of accepting privilege claims.
  const allowed: Record<string, string[]> = {
    "entry-save": [
      "action",
      "id",
      "projectId",
      "organizationId",
      "kind",
      "title",
      "description",
      "url",
      "subtitle",
      "technologies",
      "startDate",
      "endDate",
      "version",
      "aiAssisted",
    ],
  };
  const expected =
    allowed[action] || Object.keys((schemas[action] as z.AnyZodObject).shape);
  if (Object.keys(body).some((key) => !expected.includes(key)))
    throw new ApiError(400, "INVALID_COMMUNITY_INPUT", "Unexpected field");
  return result.data as CommunityAction;
}
export function mentionHandles(body: string) {
  return [
    ...new Set(
      [
        ...body.matchAll(/(?:^|[\s(])@([a-z][a-z0-9_-]{2,31})(?![a-z0-9_-])/gi),
      ].map((m) => m[1].toLowerCase()),
    ),
  ].slice(0, 10);
}
