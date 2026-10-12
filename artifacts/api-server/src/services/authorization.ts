import { z } from "zod/v4";
import { databaseQuery, type QueryExecutor } from "./database-query";

const permissionInput = z
  .object({
    userId: z.uuid(),
    organizationId: z.uuid(),
    permission: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9_.:-]*$/),
  })
  .strict();

export async function hasPermission(
  input: z.infer<typeof permissionInput>,
  query: QueryExecutor = databaseQuery,
): Promise<boolean> {
  const parsed = permissionInput.parse(input);
  const result = await query(
    `SELECT 1 AS allowed
     FROM organization_members m
     JOIN users u ON u.id = m.user_id
     JOIN role_permissions rp ON rp.role_id = m.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE m.user_id = $1 AND m.organization_id = $2
       AND m.status = 'active' AND u.status = 'active' AND p.key = $3
     LIMIT 1`,
    [parsed.userId, parsed.organizationId, parsed.permission],
  );
  return result.rows.length === 1;
}
