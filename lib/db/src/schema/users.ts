import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  index,
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { userStatusEnum } from "./enums";

export const platformRoleEnum = pgEnum("platform_role", [
  "moderator",
  "admin",
  "super_admin",
]);

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authSubject: text("auth_subject").notNull(),
    email: text("email"),
    phone: text("phone"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    platformRole: platformRoleEnum("platform_role"),
    mfaRecoveryRequired: boolean("mfa_recovery_required")
      .notNull()
      .default(false),
    status: userStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_auth_subject_unique").on(table.authSubject),
    uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
    uniqueIndex("users_phone_unique").on(table.phone),
    index("users_status_idx").on(table.status),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    authSubject: z.string().trim().min(1).max(255),
    email: z.email().max(320).nullable(),
  });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
