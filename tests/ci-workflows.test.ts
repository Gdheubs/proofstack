import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const workflow = (name: string) =>
  readFileSync(`${root}/.github/workflows/${name}`, "utf8").replace(
    /\r\n/g,
    "\n",
  );

// Source policy checks complement, but do not replace, actionlint/hosted runs.
describe("CI workflow supply-chain policy", () => {
  it("covers the actual master branch as well as main on pushes", () => {
    for (const file of ["ci.yml", "security.yml"]) {
      expect(workflow(file)).toContain("branches: [main, master]");
    }
  });
  it("pins every external action to a full commit, not a mutable tag", () => {
    const files = readdirSync(`${root}/.github/workflows`).filter((name) =>
      /\.ya?ml$/.test(name),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const actions = [...workflow(file).matchAll(/\buses:\s*([^\s#]+)/g)];
      expect(actions.length).toBeGreaterThan(0);
      for (const [, action] of actions) {
        expect(action, `${file}: ${action}`).toMatch(
          /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/,
        );
      }
    }
  });

  it("sets Node 24 before installing pnpm 11 and keeps frozen installs", () => {
    const source = workflow("ci.yml");
    expect(source.indexOf("uses: actions/setup-node@")).toBeLessThan(
      source.indexOf("uses: pnpm/action-setup@"),
    );
    expect(source).toContain("node-version: 24");
    expect(source).toContain("pnpm install --frozen-lockfile");
  });

  it("checks migration reruns and generated drift before tests/builds", () => {
    const source = workflow("ci.yml");
    expect(
      source.match(/run: pnpm --filter @workspace\/db run migrate:dev/g),
    ).toHaveLength(2);
    expect(source).toContain("run: node scripts/ci-check-generated.mjs");
    expect(
      source.indexOf("run: node scripts/ci-check-generated.mjs"),
    ).toBeLessThan(source.indexOf("run: pnpm typecheck"));
    expect(source).toContain("run: pnpm test:all");
    expect(source).toContain(
      "run: pnpm --filter @workspace/api-server run build",
    );
    expect(source).toContain(
      "run: pnpm --filter @workspace/proofstack run build",
    );
  });

  it("grants workflow-run read access only to the CodeQL job", () => {
    const security = workflow("security.yml");
    const codeql = security.match(/^ {2}codeql:\n(?: {4}.*\n|\n)*/m)?.[0];
    expect(codeql).toBeDefined();
    const permissions = codeql?.match(
      /^ {4}permissions:\n((?: {6}.*\n)+)/m,
    )?.[1];
    expect(
      permissions
        ?.trim()
        .split("\n")
        .map((line) => line.trim())
        .sort(),
    ).toEqual(["actions: read", "contents: read", "security-events: write"]);
    // Neither the workflow default nor the secret scanner needs Actions access.
    expect(security.replace(codeql!, "")).not.toMatch(
      /\bactions:\s*(?:read|write)/,
    );
  });

  it("adds a separately scoped SAST scanner without deployment credentials", () => {
    const security = workflow("security.yml");
    expect(security).toContain("security-events: write");
    expect(security).toContain("languages: javascript-typescript");
    expect(security).toContain("build-mode: none");
    expect(security).toContain("github/codeql-action/analyze@");
    for (const file of ["ci.yml", "security.yml"]) {
      const source = workflow(file);
      expect(source).toContain("permissions:\n  contents: read");
      expect(source).toContain("persist-credentials: false");
      expect(source).not.toMatch(
        /pull_request_target|\$\{\{\s*secrets\s*\.|id-token:\s*write|contents:\s*write|continue-on-error:\s*true|\b(?:deploy|publish)\b/i,
      );
    }
    expect(workflow("ci.yml")).toContain(
      "run: pnpm audit --audit-level moderate",
    );
  });
});
