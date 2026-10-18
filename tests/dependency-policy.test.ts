import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  new URL("../pnpm-workspace.yaml", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const lock = readFileSync(
  new URL("../pnpm-lock.yaml", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

describe("native install and security dependency policy", () => {
  it.each([
    ["express", "dependencies"],
    ["@types/express", "devDependencies"],
  ] as const)(
    "declares root test dependency %s with the API version",
    (name, section) => {
      const root = JSON.parse(
        readFileSync(new URL("../package.json", import.meta.url), "utf8"),
      );
      const api = JSON.parse(
        readFileSync(
          new URL("../artifacts/api-server/package.json", import.meta.url),
          "utf8",
        ),
      );
      expect(api[section][name]).toEqual(expect.any(String));
      expect(root.devDependencies[name]).toBe(api[section][name]);
      // A transitive/API-only lock entry cannot satisfy imports from root tests.
      const rootImporter = lock
        .split("\n  .:\n")[1]
        ?.split("\n  artifacts/")[0];
      expect(rootImporter).toContain(
        `      ${name.startsWith("@") ? `'${name}'` : name}:\n        specifier: ${root.devDependencies[name]}\n`,
      );
    },
  );

  it("lets core native toolchains select their own OS/CPU packages", () => {
    const removals = workspace
      .split("\n")
      .filter((line) => /:\s*['"]-['"]\s*$/.test(line));
    expect(
      removals.filter((line) =>
        /(?:esbuild>|rollup>|@tailwindcss\/oxide>|lightningcss>)/.test(line),
      ),
    ).toEqual([]);
    // This task does not change the unrelated ngrok platform policy.
    expect(workspace).toContain(
      "'@expo/ngrok-bin>@expo/ngrok-bin-win32-x64': '-'",
    );
  });

  it("patches only the vulnerable Firestore gRPC dependency", () => {
    expect(workspace).toContain("'@firebase/firestore>@grpc/grpc-js': 1.13.7");
    expect(lock).not.toContain("'@grpc/grpc-js@1.9.16'");
    expect(lock).toContain("'@grpc/grpc-js@1.13.7'");
    expect(lock).toContain("'@grpc/grpc-js@1.14.6'");
  });
});
