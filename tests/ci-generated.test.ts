import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(
  new URL("../scripts/ci-check-generated.mjs", import.meta.url),
);
const fixtures: string[] = [];
const generated = "lib/api-zod/src/generated/api.ts";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "proofstack-ci-generated-"));
  fixtures.push(root);
  mkdirSync(join(root, "lib/api-zod/src/generated"), { recursive: true });
  const result = spawnSync("git", ["init", "--quiet"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("Cannot prepare Git fixture");
  return root;
}
const check = (root: string) =>
  spawnSync(process.execPath, [script, root], { encoding: "utf8" });

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("CI generated-output drift check", () => {
  it("accepts an unchanged generated tree", () => {
    const result = check(fixture());
    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects newly generated untracked files", () => {
    const root = fixture();
    writeFileSync(join(root, generated), "export const version = 2;\n");
    const result = check(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(generated);
  });

  it("rejects staged generated output too", () => {
    const root = fixture();
    writeFileSync(join(root, generated), "export const version = 2;\n");
    const staged = spawnSync("git", ["add", "--", generated], { cwd: root });
    expect(staged.status).toBe(0);
    expect(check(root).status).toBe(1);
  });

  it("also covers the React client output tree", () => {
    const root = fixture();
    const client = "lib/api-client-react/src/generated";
    mkdirSync(join(root, client), { recursive: true });
    writeFileSync(join(root, client, "api.ts"), "export {};\n");
    expect(check(root).status).toBe(1);
  });

  it("does not reject unrelated worktree edits", () => {
    const root = fixture();
    writeFileSync(join(root, "unrelated.txt"), "fixture\n");
    expect(check(root).status).toBe(0);
  });

  it("fails closed when Git cannot read the target repository", () => {
    const root = fixture();
    rmSync(join(root, ".git"), { recursive: true, force: true });
    const result = check(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Git status failed");
  });
});
