import { assessmentCatalog } from "./assessment-catalog";
export type SkillQuestion = {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  correctOptionId: string;
};
export type SkillSnapshot = {
  title: string;
  skill: string;
  questions: SkillQuestion[];
};
function question(
  id: string,
  prompt: string,
  labels: [string, string, string],
  correctOptionId: string,
): SkillQuestion {
  return {
    id,
    prompt,
    options: labels.map((label, i) => ({ id: ["a", "b", "c"][i]!, label })),
    correctOptionId,
  };
}
// Immutable versioned server-only bank. Changes require a new version; attempts also store their snapshot.
export const questionVersion = 1;
const banks: Record<string, SkillQuestion[]> = {
  "javascript-foundations": [
    question(
      "js-const",
      "What does const prevent when declaring an object?",
      [
        "Changing any property of the object",
        "Reassigning the variable to another value",
        "Passing the object to a function",
      ],
      "b",
    ),
    question(
      "js-equality",
      "What is the value of 0 === '0'?",
      ["false", "true", "undefined"],
      "a",
    ),
    question(
      "js-map",
      "What does [1, 2, 3].map(n => n * 2) return?",
      ["6", "[1, 2, 3]", "[2, 4, 6]"],
      "c",
    ),
    question(
      "js-await",
      "Inside an async function, what does await do with a pending Promise?",
      [
        "Blocks the entire JavaScript runtime",
        "Pauses that function until the Promise settles",
        "Always returns undefined immediately",
      ],
      "b",
    ),
    question(
      "js-nullish",
      "What is the value of 0 ?? 10?",
      ["0", "10", "null"],
      "a",
    ),
  ],
  "web-accessibility": [
    question(
      "a11y-button",
      "Which element is most appropriate for an action that opens a dialog?",
      [
        "A div with a click handler only",
        "A span styled to look clickable",
        "A button with an accessible name",
      ],
      "c",
    ),
    question(
      "a11y-alt",
      "An image is purely decorative and conveys no information. What alt attribute should it use?",
      ['alt=""', "No alt attribute", 'alt="image"'],
      "a",
    ),
    question(
      "a11y-label",
      "How should a visible label be connected to a text input?",
      [
        "By putting them next to each other only",
        "A label for attribute matching the input id",
        "By using a placeholder instead of a label",
      ],
      "b",
    ),
    question(
      "a11y-keyboard",
      "What should keyboard users be able to do with interactive controls?",
      [
        "Reach them with Tab only, with no visible focus",
        "Use the mouse to activate them",
        "Reach and operate them with a visible focus indicator",
      ],
      "c",
    ),
    question(
      "a11y-color",
      "How should a form communicate an error accessibly?",
      [
        "Use only a red border",
        "Provide explanatory text, not color alone",
        "Hide the error text from assistive technology",
      ],
      "b",
    ),
  ],
};
export function assessmentSnapshot(id: string): SkillSnapshot | null {
  const summary = assessmentCatalog().assessments.find((a) => a.id === id);
  const questions = banks[id];
  return summary && questions
    ? { title: summary.title, skill: summary.skill, questions }
    : null;
}
