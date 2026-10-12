import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
export const serviceHeartbeatsTable = pgTable(
  "service_heartbeats",
  {
    id: uuid("id").primaryKey(),
    service: text("service").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("service_heartbeat_seen_idx").on(t.service, t.lastSeenAt)],
);
