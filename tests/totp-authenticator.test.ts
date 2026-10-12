import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const helper = createRequire(import.meta.url)(
  "./helpers/totp-authenticator.cjs",
) as {
  testTotp(secret: string, now: number): string;
};

describe("isolated test authenticator RFC6238 SHA1 vectors", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  for (const [seconds, code] of [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ] as const) {
    it(`matches the published vector at ${seconds} seconds`, () => {
      expect(helper.testTotp(secret, seconds * 1000)).toBe(code);
    });
  }
});
