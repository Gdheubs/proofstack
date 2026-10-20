import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  repoPath,
  initialize,
  commitFile,
  treeEntries,
  readSource,
  syncRefs,
  git,
  history,
  quota,
} from "../artifacts/api-server/src/services/repository-git";
import {
  repoInput,
  pathSchema,
  branchSchema,
  receivePackCommands,
} from "../artifacts/api-server/src/services/repository-input";
let folder = "";
afterEach(async () => {
  vi.unstubAllEnvs();
  if (folder) await rm(folder, { recursive: true, force: true });
});
describe("Native Git repository operations", () => {
  it("creates real objects, browses nested source, preserves history and produces cloneable refs", async () => {
    folder = await mkdtemp(join(tmpdir(), "proofstack-git-test-"));
    vi.stubEnv("REPOSITORY_ROOT", folder);
    const path = await repoPath(randomUUID(), true);
    await initialize(path);
    const author = { id: randomUUID(), name: "Test Builder" };
    const first = await commitFile(
      path,
      null,
      "README.md",
      "# Native Git\n",
      "Initial commit",
      author,
    );
    const second = await commitFile(
      path,
      first,
      "src/index.ts",
      "export const answer = 42;\n",
      "Add source",
      author,
    );
    expect(second).toMatch(/^[0-9a-f]{40}$/);
    await syncRefs(path, [
      { name: "main", head: first },
      { name: "feature/source", head: second },
    ]);
    expect((await treeEntries(path, second, "")).map((e) => e.name)).toEqual([
      "src",
      "README.md",
    ]);
    expect((await readSource(path, second, "src/index.ts")).content).toContain(
      "answer = 42",
    );
    expect(
      (await history(path, second, 0)).commits.map((c) => c.message),
    ).toEqual(["Add source", "Initial commit"]);
    await expect(
      commitFile(
        path,
        second,
        "src/index.ts",
        "export const answer = 42;\n",
        "No change",
        author,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const third = await commitFile(
      path,
      second,
      "src/index.ts",
      "",
      "Delete source",
      author,
      true,
    );
    await expect(readSource(path, third, "src/index.ts")).rejects.toMatchObject(
      { status: 404 },
    );
    expect(
      (await git(path, ["fsck", "--no-reflogs", "--no-dangling"])).length,
    ).toBe(0);
    const routeFile = "app/(site)/[id]/page.tsx";
    const routeHead = await commitFile(
      path,
      third,
      routeFile,
      "export default function Page() { return null; }",
      "Add dynamic route",
      author,
    );
    expect((await readSource(path, routeHead, routeFile)).content).toContain(
      "function Page",
    );
    await expect(quota(path, 1)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects traversal, Git metadata paths, unsafe refs and oversized content", () => {
    for (const value of [
      "../config",
      "/etc/passwd",
      "src/../../config",
      ".git/config",
      "x/.GiT/hooks",
      "a\\b",
      "a:b",
      "file.",
    ])
      expect(pathSchema.safeParse(value).success).toBe(false);
    for (const value of [
      "--help",
      "a..b",
      "a//b",
      "HEAD~1",
      "x.lock",
      "a/.hidden",
    ])
      expect(branchSchema.safeParse(value).success).toBe(false);
    expect(() =>
      repoInput({
        action: "commit",
        id: randomUUID(),
        branch: "main",
        expectedHead: "a".repeat(40),
        path: "large.txt",
        content: "x".repeat(1024 * 1024 + 1),
        message: "Too large",
      }),
    ).toThrow();
  });
  it("defaults repository credentials to read scope and accepts explicit write scope", () => {
    const id = randomUUID();
    expect(
      repoInput({ action: "token-create", id, name: "Laptop" }),
    ).toMatchObject({
      action: "token-create",
      scope: "read",
    });
    expect(
      repoInput({ action: "token-create", id, name: "Laptop", scope: "write" }),
    ).toMatchObject({ scope: "write" });
    expect(() =>
      repoInput({ action: "token-create", id, name: "Laptop", scope: "admin" }),
    ).toThrow();
  });
  it("accepts only complete single feature-branch receive-pack updates", () => {
    const pkt = (line: string) =>
      Buffer.from((line.length + 4).toString(16).padStart(4, "0") + line);
    const zero = "0".repeat(40);
    const head = "a".repeat(40);
    expect(
      receivePackCommands(
        Buffer.concat([
          pkt(`${zero} ${head} refs/heads/feature/editor\0report-status\n`),
          Buffer.from("0000"),
        ]),
      ),
    ).toEqual([{ oldHead: zero, newHead: head, branch: "feature/editor" }]);
    for (const ref of ["refs/tags/v1"]) {
      expect(() =>
        receivePackCommands(
          Buffer.concat([pkt(`${zero} ${head} ${ref}\n`), Buffer.from("0000")]),
        ),
      ).toThrow();
    }
    expect(() =>
      receivePackCommands(
        Buffer.concat([
          pkt(`${head} ${zero} refs/heads/feature/editor\n`),
          Buffer.from("0000"),
        ]),
      ),
    ).toThrow();
    expect(() =>
      receivePackCommands(
        Buffer.from(
          `${(4 + zero.length + 1 + head.length + 1 + "refs/heads/feature/x".length).toString(16)}${zero} ${head} refs/heads/feature/x`,
        ),
      ),
    ).toThrow();
  });
  it("fails closed when durable storage is unconfigured", async () => {
    vi.stubEnv("REPOSITORY_ROOT", "");
    await expect(repoPath(randomUUID())).rejects.toMatchObject({ status: 503 });
  });
});
