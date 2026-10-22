import { describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../artifacts/api-server/src/services/database-query", () => ({
  databaseQuery: query,
}));
import { pruneWhenDue } from "../artifacts/api-server/src/services/rate-limit";

describe("rate-limit housekeeping", () => {
  it("runs on traffic at most every 15 minutes, never on a timer", async () => {
    query.mockResolvedValue({ rows: [] });
    pruneWhenDue(1_000);
    pruneWhenDue(2_000);
    pruneWhenDue(1_000 + 14 * 60_000);
    expect(query).toHaveBeenCalledTimes(1);
    pruneWhenDue(1_000 + 15 * 60_000);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("retries on the next request after a failure", async () => {
    query.mockReset();
    query.mockRejectedValueOnce(new Error("db down"));
    const start = 10 * 60 * 60_000;
    pruneWhenDue(start);
    await new Promise((resolve) => setTimeout(resolve, 0));
    query.mockResolvedValue({ rows: [] });
    pruneWhenDue(start + 1);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
