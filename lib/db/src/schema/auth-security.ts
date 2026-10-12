import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const authFlowsTable = pgTable(
  "auth_flows",
  {
    handleHash: text("handle_hash").primaryKey(),
    encryptedPayload: text("encrypted_payload").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("auth_flows_expiry_idx").on(t.expiresAt)],
);

export const authFailuresTable = pgTable(
  "auth_failures",
  {
    identifierHash: text("identifier_hash").primaryKey(),
    failures: integer("failures").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("auth_failures_window_idx").on(t.windowStartedAt)],
);

export const recoveryCodesTable = pgTable(
  "auth_recovery_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("auth_recovery_codes_user_idx").on(t.userId)],
);

export const authHookReceiptsTable = pgTable(
  "auth_hook_receipts",
  {
    eventHash: text("event_hash").primaryKey(),
    status: text("status").notNull().default("pending"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("auth_hook_receipts_time_idx").on(t.acceptedAt)],
);
