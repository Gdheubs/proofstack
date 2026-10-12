import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  intelligenceInput,
  planSchema,
} from "../artifacts/api-server/src/services/intelligence-input";
import { matchOpportunities } from "../artifacts/api-server/src/services/intelligence-matching";
import { scanText } from "../artifacts/api-server/src/services/intelligence-scanner";
import { estimateCostMicros } from "../artifacts/api-server/src/services/intelligence-provider";
afterEach(() => vi.unstubAllEnvs());
describe("Intelligence boundaries", () => {
  it("requires explicit AI consent and rejects forged output, identity and execution fields", () => {
    const input = {
      action: "enqueue",
      kind: "career-plan",
      requestKey: randomUUID(),
      jobId: randomUUID(),
    };
    expect(intelligenceInput.safeParse(input).success).toBe(false);
    expect(
      intelligenceInput.safeParse({ ...input, consent: false }).success,
    ).toBe(false);
    expect(
      intelligenceInput.safeParse({ ...input, consent: true }).success,
    ).toBe(true);
    for (const extra of [
      { status: "succeeded" },
      { userId: randomUUID() },
      { command: "npm test" },
      { result: {} },
    ])
      expect(
        intelligenceInput.safeParse({ ...input, consent: true, ...extra })
          .success,
      ).toBe(false);
  });
  it("rejects unsafe branches and arbitrary revisions", () => {
    const input = {
      action: "enqueue",
      kind: "security-scan",
      requestKey: randomUUID(),
      repositoryId: randomUUID(),
      branch: "main",
      expectedHead: "a".repeat(40),
    };
    expect(intelligenceInput.safeParse(input).success).toBe(true);
    expect(
      intelligenceInput.safeParse({ ...input, branch: "--upload-pack=evil" })
        .success,
    ).toBe(false);
    expect(
      intelligenceInput.safeParse({ ...input, expectedHead: "main~2" }).success,
    ).toBe(false);
  });
  it("explains normalized skill overlap without duplicate labels or substring guessing", () => {
    const base = {
      organization: "Test",
      kind: "job",
      workplace: "remote",
      title: "Developer",
    };
    const result = matchOpportunities(
      [" TypeScript ", "SQL"],
      [
        {
          ...base,
          id: "a",
          skills: ["typescript", "TypeScript", "PostgreSQL"],
        },
        { ...base, id: "b", skills: ["SQL", "TYPESCRIPT"] },
        { ...base, id: "c", skills: ["SQL"], workplace: "onsite" },
      ],
      "remote",
    );
    expect(result.map((r) => r.id)).toEqual(["b", "a"]);
    expect(result[1].matchedSkills).toEqual(["TypeScript"]);
    expect(result[1].otherSkills).toEqual(["PostgreSQL"]);
    expect(
      matchOpportunities([], [{ ...base, id: "d", skills: ["SQL"] }], "any"),
    ).toEqual([]);
  });
  it("returns only rule metadata and locations, never matched credential values", () => {
    const fake = "ghp_" + "A".repeat(36);
    const content = `const token = "${fake}";\nconst password = "not-a-real-secret-value";\nconst agent = {rejectUnauthorized:false};\neval(userInput);\n-----BEGIN PRIVATE KEY-----`;
    const result = scanText("src/example.ts", content);
    expect(result.map((r) => r.rule)).toEqual([
      "credential-token",
      "literal-secret",
      "tls-disabled",
      "dynamic-eval",
      "private-key",
    ]);
    expect(result[2].line).toBe(3);
    expect(JSON.stringify(result)).not.toContain(fake);
    expect(JSON.stringify(result)).not.toContain("not-a-real-secret-value");
    expect(scanText("x.ts", "eval(x);\n".repeat(1000))).toHaveLength(100);
  });
  it("bounds generated plans and rejects extra fields", () => {
    const step = {
      title: "Practice",
      objective: "Learn",
      exercise: "Build a small example",
      evidence: "Document the result",
    };
    expect(
      planSchema.safeParse({ summary: "Plan", steps: [step] }).success,
    ).toBe(true);
    expect(
      planSchema.safeParse({ summary: "Plan", steps: Array(6).fill(step) })
        .success,
    ).toBe(false);
    expect(
      planSchema.safeParse({
        summary: "Plan",
        steps: [{ ...step, verified: true }],
      }).success,
    ).toBe(false);
  });
  it("only estimates usage with explicit valid operator rates", () => {
    vi.stubEnv("INTELLIGENCE_INPUT_USD_PER_MILLION", "");
    vi.stubEnv("INTELLIGENCE_OUTPUT_USD_PER_MILLION", "");
    expect(estimateCostMicros(100, 100)).toBeNull();
    vi.stubEnv("INTELLIGENCE_INPUT_USD_PER_MILLION", "2");
    vi.stubEnv("INTELLIGENCE_OUTPUT_USD_PER_MILLION", "8");
    expect(estimateCostMicros(100, 50)).toBe(600);
    expect(estimateCostMicros(null, 50)).toBeNull();
    vi.stubEnv("INTELLIGENCE_INPUT_USD_PER_MILLION", "invalid");
    expect(estimateCostMicros(100, 50)).toBeNull();
  });
});
