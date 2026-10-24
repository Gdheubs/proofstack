import { describe, expect, it } from "vitest";
import {
  buildTree,
  parseRepository,
} from "../artifacts/proofstack/features/editor/editor-api";

describe("editor client helpers", () => {
  it("reads a repository name from owner/name or a GitHub address", () => {
    for (const input of [
      "octo/app",
      " octo/app ",
      "https://github.com/octo/app",
      "https://www.github.com/octo/app.git",
      "https://github.com/octo/app/tree/main/src",
      "https://github.com/octo/app#readme",
      "https://github.com/octo/app?tab=issues",
      // Anything after the repository name is ignored, as in a copied address.
      "octo/app/blob/main/README.md",
    ])
      expect(parseRepository(input)).toBe("octo/app");
    expect(parseRepository("octo/my.app-2")).toBe("octo/my.app-2");
    for (const input of [
      "",
      "app",
      "octo/.git",
      "https://gitlab.com/octo/app",
      "octo/app name",
      "octo/" + "a".repeat(101),
    ])
      expect(parseRepository(input)).toBeNull();
  });

  it("groups flat paths into sorted folders and files", () => {
    const tree = buildTree(["src/b.ts", "README.md", "src/a.ts", "src/lib/c"]);
    expect(tree.map((n) => `${n.kind}:${n.name}`)).toEqual([
      "folder:src",
      "file:README.md",
    ]);
    expect(tree[0]!.children.map((n) => n.name)).toEqual([
      "lib",
      "a.ts",
      "b.ts",
    ]);
  });
});
