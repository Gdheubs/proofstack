import { describe, expect, it } from "vitest";
import { assessmentCatalog } from "../artifacts/api-server/src/services/assessment-catalog";
import {
  assessmentSnapshot,
  topicBreakdown,
} from "../artifacts/api-server/src/services/assessment-questions";

describe("skill-check question bank", () => {
  for (const { id, questionCount } of assessmentCatalog().assessments) {
    it(`${id}: every attempt covers each topic with unique questions and options`, () => {
      for (let run = 0; run < 50; run++) {
        const snapshot = assessmentSnapshot(id)!;
        expect(snapshot.questions).toHaveLength(questionCount);
        expect(new Set(snapshot.questions.map((q) => q.id)).size).toBe(
          questionCount,
        );
        expect(new Set(snapshot.questions.map((q) => q.topic)).size).toBe(6);
        for (const q of snapshot.questions) {
          expect(q.options).toHaveLength(4);
          expect(new Set(q.options.map((o) => o.label)).size).toBe(4);
          expect(new Set(q.options.map((o) => o.id)).size).toBe(4);
          expect(q.options.map((o) => o.id)).toContain(q.correctOptionId);
        }
      }
    });

    it(`${id}: the correct option is not always in the same position`, () => {
      const positions = new Set<number>();
      for (let run = 0; run < 30; run++)
        for (const q of assessmentSnapshot(id)!.questions)
          positions.add(q.options.findIndex((o) => o.id === q.correctOptionId));
      expect(positions.size).toBe(4);
    });

    it(`${id}: three adaptive attempts in a row never repeat a question set`, () => {
      const history: Parameters<typeof assessmentSnapshot>[1] = [];
      const seen = new Set<string>();
      for (let attempt = 0; attempt < 3; attempt++) {
        const snapshot = assessmentSnapshot(id, history)!;
        for (const q of snapshot.questions) {
          expect(seen.has(q.id)).toBe(false);
          seen.add(q.id);
        }
        history.unshift({
          snapshot,
          answers: Object.fromEntries(
            snapshot.questions.map((q) => [q.id, q.correctOptionId]),
          ),
        });
      }
    });
  }

  it("grades older snapshots without topics using the bank", () => {
    const snapshot = {
      title: "Old",
      skill: "JavaScript",
      questions: [
        {
          id: "js-const",
          prompt: "",
          options: [{ id: "b", label: "" }],
          correctOptionId: "b",
        },
      ],
    };
    expect(
      topicBreakdown("javascript-foundations", snapshot, { "js-const": "b" }),
    ).toEqual([{ topic: "Variables and scope", correct: 1, total: 1 }]);
  });
});
