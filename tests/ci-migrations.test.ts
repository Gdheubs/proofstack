import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const directory = fileURLToPath(new URL("../lib/db/drizzle/", import.meta.url));
const journal = JSON.parse(
  readFileSync(`${directory}/meta/_journal.json`, "utf8"),
) as {
  dialect: string;
  entries: { idx: number; when: number; tag: string }[];
};

describe("CI migration inventory", () => {
  it("registers every SQL migration exactly once in the journal", () => {
    expect(journal.dialect).toBe("postgresql");
    expect(journal.entries.length).toBeGreaterThan(0);
    const files = readdirSync(directory).filter((file) =>
      file.endsWith(".sql"),
    );
    const registered = journal.entries.map((entry) => `${entry.tag}.sql`);
    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual(files.sort());
  });

  it("keeps safe file names and strictly ordered migration checkpoints", () => {
    for (const [index, entry] of journal.entries.entries()) {
      expect(entry.idx).toBe(index);
      expect(entry.tag).toMatch(/^\d{4}_[\w-]+$/);
      expect(entry.tag.startsWith(`${String(index).padStart(4, "0")}_`)).toBe(
        true,
      );
      expect(Number.isSafeInteger(entry.when)).toBe(true);
      expect(entry.when).toBeGreaterThan(journal.entries[index - 1]?.when ?? 0);
      expect(
        readFileSync(`${directory}/${entry.tag}.sql`, "utf8").trim().length,
      ).toBeGreaterThan(0);
    }
  });
});
