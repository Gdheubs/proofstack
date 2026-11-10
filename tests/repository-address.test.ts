import { describe, expect, it } from "vitest";
import { hostedRepositoryPath } from "../artifacts/proofstack/lib/repository-address";

const site = "https://proofstack.example";

describe("hosted repository links", () => {
  it("recognises <site>/<handle>/<name> on this site", () => {
    expect(hostedRepositoryPath(`${site}/suhai/qa-test-repo`, site)).toBe(
      "/suhai/qa-test-repo",
    );
  });
  it("leaves other links (GitHub, other sites, other paths) as external", () => {
    for (const url of [
      "https://github.com/suhai/qa-test-repo",
      "https://proofstack.example.evil/suhai/repo",
      `${site}/projects`,
      `${site}/a/b/c`,
      "not a url",
      "",
    ])
      expect(hostedRepositoryPath(url, site)).toBeNull();
    expect(hostedRepositoryPath(`${site}/suhai/repo`, "")).toBeNull();
  });
});
