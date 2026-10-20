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
const meta = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../lib/db/drizzle/meta/${name}_snapshot.json`, import.meta.url),
      "utf8",
    ),
  );
const snapshot = meta("0011");
const previous = meta("0010");
const beforeR2 = meta("0012");
const latest = meta("0013");
const table = "public.asset_cleanup_jobs";

describe("asset cleanup migration metadata", () => {
  it("matches the declared schema exactly in the latest snapshot", () => {
    const generated = generateDrizzleJson(schema, latest.prevId);
    expect(generated.tables[table]).toEqual(latest.tables[table]);
  });
  it("changes only the storage-version check when moving to R2", () => {
    expect(latest.prevId).toBe(beforeR2.id);
    const { checkConstraints: was, ...beforeRest } = beforeR2.tables[table];
    const { checkConstraints: now, ...latestRest } = latest.tables[table];
    expect(latestRest).toEqual(beforeRest);
    const { asset_cleanup_generation_check: oldCheck, ...oldOthers } = was;
    const { asset_cleanup_generation_check: newCheck, ...newOthers } = now;
    expect(newOthers).toEqual(oldOthers);
    expect(oldCheck.value).toContain("'^[1-9][0-9]{0,29}$'");
    expect(newCheck.value).toContain("[0-9a-f]{32}");
    const { [table]: _was, ...otherBefore } = beforeR2.tables;
    const { [table]: _now, ...otherLatest } = latest.tables;
    expect(otherLatest).toEqual(otherBefore);
  });
  it("adds one table without rewriting historical schema metadata", () => {
    expect(snapshot.prevId).toBe(previous.id);
    const { ["public.asset_cleanup_jobs"]: cleanup, ...unchanged } =
      snapshot.tables;
    expect(cleanup).toBeDefined();
    expect(unchanged).toEqual(previous.tables);
  });
});
