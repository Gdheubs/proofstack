import { createInsertSchema } from "drizzle-zod";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationMemberStatusEnum } from "./enums";
import { organizationsTable } from "./organizations";
import { rolesTable } from "./roles";
import { usersTable } from "./users";

export const organizationMembersTable = pgTable(
  "organization_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => rolesTable.id, { onDelete: "restrict" }),
    status: organizationMemberStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("organization_members_org_user_unique").on(
      table.organizationId,
      table.userId,
    ),
    index("organization_members_user_idx").on(table.userId),
    index("organization_members_role_idx").on(table.roleId),
    index("organization_members_status_idx").on(table.status),
  ],
);

export const insertOrganizationMemberSchema = createInsertSchema(
  organizationMembersTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationMember = z.infer<
  typeof insertOrganizationMemberSchema
>;
export type OrganizationMember = typeof organizationMembersTable.$inferSelect;
