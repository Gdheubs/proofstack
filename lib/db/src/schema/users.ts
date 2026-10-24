import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  index,
  boolean,
  date,
  jsonb,
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
    // Self-declared at sign-up; the Terms require account holders to be 18+.
    birthDate: date("birth_date"),
    // Per-category in-app/email switches; missing keys mean "on".
    notificationPrefs: jsonb("notification_prefs").notNull().default({}),
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

// Proof of what each account agreed to and when (DPDP Act s.6).
export const consentRecordsTable = pgTable(
  "consent_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("consent_records_user_purpose_version_unique").on(
      table.userId,
      table.purpose,
      table.version,
    ),
  ],
);

// Registration details kept after an account is deleted, only for the period
// the IT Rules 2021 (rule 3(1)(h)) require, then purged.
export const deletedAccountsTable = pgTable(
  "deleted_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authSubject: text("auth_subject").notNull(),
    email: text("email"),
    phone: text("phone"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull(),
  },
  (table) => [index("deleted_accounts_purge_idx").on(table.purgeAfter)],
);

export const insertUserSchema = createInsertSchema(usersTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    authSubject: z.string().trim().min(1).max(255),
    email: z.email().max(320).nullable(),
  });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
