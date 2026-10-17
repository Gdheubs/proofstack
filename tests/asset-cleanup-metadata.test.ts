import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as schema from "../lib/db/src/schema";

const require = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const { generateDrizzleJson } = require("drizzle-kit/api") as {
  generateDrizzleJson(
    imports: Record<string, unknown>,
    prevId?: string,
  ): {
    tables: Record<string, unknown>;
  };
};
const snapshot = JSON.parse(
  readFileSync(
    new URL("../lib/db/drizzle/meta/0011_snapshot.json", import.meta.url),
    "utf8",
  ),
);
const previous = JSON.parse(
  readFileSync(
    new URL("../lib/db/drizzle/meta/0010_snapshot.json", import.meta.url),
    "utf8",
  ),
);

describe("asset cleanup migration metadata", () => {
  it("matches the declared schema exactly for the new table", () => {
    const generated = generateDrizzleJson(schema, snapshot.prevId);
    expect(generated.tables["public.asset_cleanup_jobs"]).toEqual(
      snapshot.tables["public.asset_cleanup_jobs"],
    );
    expect(Object.keys(generated.tables)).toHaveLength(46);
  });
  it("adds one table without rewriting historical schema metadata", () => {
    expect(snapshot.prevId).toBe(previous.id);
    const { ["public.asset_cleanup_jobs"]: cleanup, ...unchanged } =
      snapshot.tables;
    expect(cleanup).toBeDefined();
    expect(unchanged).toEqual(previous.tables);
  });
});
