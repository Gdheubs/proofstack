import { z } from "zod/v4";
import { databaseQuery, type QueryExecutor } from "./database-query";

function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, item]) =>
        /password|secret|token|authorization|cookie|credential|connectionstring/i.test(
          key,
        ) || containsSensitiveKey(item),
    );
  }
  return false;
}

export const auditEventSchema = z
  .object({
    organizationId: z.uuid().nullable().default(null),
    actorUserId: z.uuid().nullable().default(null),
    action: z
      .string()
      .min(3)
      .max(100)
      .regex(/^[a-z][a-z0-9_.:-]*$/),
    resourceType: z.string().min(1).max(100),
    resourceId: z.string().min(1).max(200).nullable().default(null),
    requestId: z.uuid(),
    metadata: z
      .record(z.string(), z.json())
      .default({})
      .refine(
        (value) =>
          !containsSensitiveKey(value) && JSON.stringify(value).length <= 8192,
        "Audit metadata must be bounded and must not contain credentials",
      ),
  })
  .strict();

/**
 * For a protected mutation pass the transaction's query executor. This makes
 * the mutation and audit append atomic; audit failure must abort that mutation.
 * Do not pass entire request bodies or provider session payloads as metadata.
 */
export async function writeAuditEvent(
  input: z.input<typeof auditEventSchema>,
  query: QueryExecutor = databaseQuery,
): Promise<string> {
  const event = auditEventSchema.parse(input);
  const result = await query(
    `INSERT INTO audit_logs
       (organization_id, actor_user_id, action, resource_type, resource_id, request_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id`,
    [
      event.organizationId,
      event.actorUserId,
      event.action,
      event.resourceType,
      event.resourceId,
      event.requestId,
      JSON.stringify(event.metadata),
    ],
  );
  const id = result.rows[0]?.id;
  if (typeof id !== "string")
    throw new Error("Audit insert did not return an identity");
  return id;
}
