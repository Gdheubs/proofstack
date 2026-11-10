import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Usernames given up by a rename or account deletion. For 90 days nobody else
// can take them, and addresses using them (/<handle>/<repository>, git clone)
// keep reaching the previous owner, so recycled names cannot take over links.
export const retiredHandlesTable = pgTable(
  "retired_handles",
  {
    // Lowercase handle.
    handle: text("handle").primaryKey(),
    // Null once the account is deleted: the name stays reserved, unowned.
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    retiredAt: timestamp("retired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("retired_handles_user_idx").on(t.userId)],
);
