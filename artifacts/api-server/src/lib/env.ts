import { z } from "zod/v4";
import { validProxyRange } from "./transport";

const origin = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && url.origin === value;
  }, "Expected an exact HTTP(S) origin without a trailing slash or path");

export const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535),
  BIND_HOST: z.enum(["127.0.0.1", "0.0.0.0", "::1", "::"]).default("0.0.0.0"),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      "Expected a PostgreSQL URL",
    ),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(origin)),
  TRUST_PROXY_CIDRS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(
      z.array(
        z
          .string()
          .refine(
            validProxyRange,
            "Expected an explicit IP or non-universal CIDR",
          ),
      ),
    ),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3600)
    .default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(120),
  // Shared with the web tier; blank disables forwarded client addresses.
  PROXY_SHARED_SECRET: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().min(32).optional()),
});

export function parseEnvironment(input: Record<string, unknown>) {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0])),
    ];
    // Never include variable values or connection strings in configuration errors.
    throw new Error(`Invalid application environment: ${fields.join(", ")}`);
  }
  return result.data;
}

export const env = parseEnvironment(process.env);
