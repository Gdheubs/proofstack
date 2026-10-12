import { z } from "zod/v4";

const email = z
  .email()
  .max(320)
  .transform((v) => v.toLowerCase());
const phone = z
  .string()
  .trim()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    "Use an international phone number, including +country code",
  );
const name = z.string().trim().min(1).max(160);
const kind = z.enum(["developer", "company", "recruiter"]);
const password = z
  .string()
  .min(12)
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "Password must be at most 72 UTF-8 bytes",
  );
const id = z.uuid();
const code = z
  .string()
  .trim()
  .regex(/^\d{6,10}$/, "Enter the provider-issued code");
export const authActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("signup"),
      email,
      password,
      displayName: name,
      kind,
    })
    .strict(),
  z
    .object({
      action: z.literal("password-login"),
      email,
      password: z.string().min(1).max(256),
    })
    .strict(),
  z
    .object({
      action: z.literal("email-otp"),
      email,
      displayName: name.optional(),
      kind: kind.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("phone-otp"),
      phone,
      displayName: name.optional(),
      kind: kind.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("verify-otp"),
      handle: z.string().min(40).max(80),
      code,
    })
    .strict(),
  z
    .object({
      action: z.literal("oauth"),
      provider: z.enum(["google", "github"]),
    })
    .strict(),
  z.object({ action: z.literal("password-reset"), email }).strict(),
  z.object({ action: z.literal("update-password"), password }).strict(),
  z
    .object({ action: z.literal("logout"), scope: z.enum(["local", "global"]) })
    .strict(),
  z.object({ action: z.literal("revoke-session"), sessionId: id }).strict(),
  z
    .object({ action: z.literal("update-profile"), displayName: name, kind })
    .strict(),
  z.object({ action: z.literal("send-phone-verification"), phone }).strict(),
  z
    .object({
      action: z.literal("mfa-enroll"),
      factorType: z.enum(["totp", "phone"]),
      phone: phone.optional(),
    })
    .strict(),
  z.object({ action: z.literal("mfa-challenge"), factorId: id }).strict(),
  z
    .object({
      action: z.literal("mfa-verify"),
      factorId: id,
      challengeId: id.optional(),
      code,
    })
    .strict(),
  z.object({ action: z.literal("mfa-remove"), factorId: id }).strict(),
  z.object({ action: z.literal("recovery-codes") }).strict(),
  z
    .object({
      action: z.literal("recover-mfa"),
      code: z.string().trim().min(32).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("create-organization"),
      name,
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .min(3)
        .max(63),
    })
    .strict(),
  z
    .object({
      action: z.literal("organization-role"),
      organizationId: id,
      userId: id,
      role: z.enum(["organization_owner", "organization_admin"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("user-role"),
      userId: id,
      role: z.enum(["moderator", "admin", "super_admin"]).nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("user-status"),
      userId: id,
      status: z.enum(["active", "disabled"]),
    })
    .strict(),
]);
export type AuthInput = z.infer<typeof authActionSchema>;
export type MfaInput = Extract<
  AuthInput,
  {
    action:
      | "mfa-enroll"
      | "mfa-challenge"
      | "mfa-verify"
      | "mfa-remove"
      | "recovery-codes"
      | "recover-mfa";
  }
>;
