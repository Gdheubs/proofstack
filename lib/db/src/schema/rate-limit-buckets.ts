import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const rateLimitBucketsTable = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull(),
  },
  (table) => [
    check("rate_limit_buckets_hits_nonnegative", sql`${table.hits} >= 0`),
    index("rate_limit_buckets_window_start_idx").on(table.windowStart),
  ],
);

export const insertRateLimitBucketSchema = createInsertSchema(
  rateLimitBucketsTable,
).extend({
  key: z.string().trim().min(1).max(512),
  hits: z.number().int().nonnegative(),
});

export type InsertRateLimitBucket = z.infer<typeof insertRateLimitBucketSchema>;
export type RateLimitBucket = typeof rateLimitBucketsTable.$inferSelect;
