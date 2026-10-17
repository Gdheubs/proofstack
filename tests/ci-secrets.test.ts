import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fail-closed secret scanning policy", () => {
  it("keeps the default detectors and only narrowly reviewed nonsecret exceptions", () => {
    const config = readFileSync(
      new URL("../.gitleaks.toml", import.meta.url),
      "utf8",
    );
    expect(config).toContain("useDefault = true");
    expect(config.match(/condition = "AND"/g)).toHaveLength(2);
    expect(config).toContain("^sb_publishable_");
    expect(config).not.toMatch(/regexes.*sb_secret_/);
    expect(config).not.toMatch(/paths\s*=\s*\[\s*['"](?:tests|docs)\//);
  });
  it("runs the pinned checksum-verified history scanner without credentials or bypasses", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/security.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("node scripts/ci-scan-secrets.mjs");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).not.toContain("continue-on-error");
    const script = readFileSync(
      new URL("../scripts/ci-scan-secrets.mjs", import.meta.url),
      "utf8",
    );
    expect(script).toContain('const version = "8.30.1"');
    expect(script).toContain(
      "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
    );
    expect(script).toContain('createHash("sha256")');
    expect(script).toContain("--redact=100");
  });
});
