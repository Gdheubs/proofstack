import { databaseQuery, type QueryExecutor } from "./database-query";

export async function consumeRateLimit(
  key: string,
  windowSeconds: number,
  limit: number,
  query: QueryExecutor = databaseQuery,
) {
  if (
    !key ||
    key.length > 200 ||
    !Number.isInteger(windowSeconds) ||
    windowSeconds < 1 ||
    !Number.isInteger(limit) ||
    limit < 1
  ) {
    throw new Error("Invalid rate limit configuration");
  }
  const result = await query(
    `INSERT INTO rate_limit_buckets (key, window_start, hits)
     VALUES ($1, to_timestamp(floor(extract(epoch FROM clock_timestamp()) / $2) * $2), 1)
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN rate_limit_buckets.window_start = EXCLUDED.window_start
                   THEN LEAST(rate_limit_buckets.hits + 1::bigint, 2147483647)::integer ELSE 1 END,
       window_start = EXCLUDED.window_start
     RETURNING hits, window_start`,
    [key, windowSeconds],
  );
  const row = result.rows[0];
  const hits = Number(row?.hits);
  const windowStart = new Date(row?.window_start as string | Date).getTime();
  if (!Number.isFinite(hits) || !Number.isFinite(windowStart)) {
    throw new Error("Invalid rate limit store response");
  }
  return {
    allowed: hits <= limit,
    remaining: Math.max(0, limit - hits),
    resetSeconds: Math.max(
      1,
      Math.ceil((windowStart + windowSeconds * 1000 - Date.now()) / 1000),
    ),
  };
}

export async function pruneRateLimitBuckets() {
  await databaseQuery(
    "DELETE FROM rate_limit_buckets WHERE window_start < now() - interval '24 hours'",
    [],
  );
}
