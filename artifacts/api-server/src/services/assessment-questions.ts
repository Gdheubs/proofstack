import { randomBytes, randomInt } from "node:crypto";
import { assessmentCatalog } from "./assessment-catalog";
export type SkillQuestion = {
  id: string;
  topic?: string;
  prompt: string;
  options: { id: string; label: string }[];
  correctOptionId: string;
};
export type SkillSnapshot = {
  title: string;
  skill: string;
  questions: SkillQuestion[];
};
type BankQuestion = {
  id: string;
  topic: string;
  prompt: string;
  // The first label is the correct answer; every attempt shuffles the options.
  labels: [string, string, string, string];
};
// A completed earlier attempt, newest first, used to adapt the next question set.
export type AttemptHistory = {
  snapshot: SkillSnapshot;
  answers: Record<string, string>;
}[];
export type Random = (max: number) => number;
const secureRandom: Random = (max) => randomInt(max);
const q = (
  id: string,
  topic: string,
  prompt: string,
  labels: [string, string, string, string],
): BankQuestion => ({ id, topic, prompt, labels });
// Server-only bank. Attempts store their own snapshot, so edits never regrade history.
export const questionVersion = 2;
const banks: Record<string, BankQuestion[]> = {
  "javascript-foundations": [
    q(
      "js-const",
      "Variables and scope",
      "What does const prevent when declaring an object?",
      [
        "Reassigning the variable to another value",
        "Changing any property of the object",
        "Passing the object to a function",
        "Adding the object to an array",
      ],
    ),
    q(
      "js-let-block",
      "Variables and scope",
      "Where can a variable declared with let inside an if block be used?",
      [
        "Only inside that block",
        "Anywhere in the enclosing function",
        "Anywhere in the program",
        "Only after the function returns",
      ],
    ),
    q(
      "js-tdz",
      "Variables and scope",
      "What happens when code reads a let variable before its declaration in the same scope?",
      [
        "It throws a ReferenceError",
        "It returns undefined",
        "It returns null",
        "It reads a global variable with the same name",
      ],
    ),
    q(
      "js-var-hoist",
      "Variables and scope",
      "What does console.log(x); var x = 5; print?",
      ["undefined", "5", "It throws a ReferenceError", "null"],
    ),
    q("js-equality", "Types and equality", "What is the value of 0 === '0'?", [
      "false",
      "true",
      "undefined",
      "It throws a TypeError",
    ]),
    q("js-typeof-null", "Types and equality", "What does typeof null return?", [
      '"object"',
      '"null"',
      '"undefined"',
      '"number"',
    ]),
    q("js-nan", "Types and equality", "What is the value of NaN === NaN?", [
      "false",
      "true",
      "undefined",
      "NaN",
    ]),
    q(
      "js-loose-null",
      "Types and equality",
      "What is the value of null == undefined?",
      ["true", "false", "It throws a TypeError", "null"],
    ),
    q(
      "js-map",
      "Arrays and objects",
      "What does [1, 2, 3].map(n => n * 2) return?",
      ["[2, 4, 6]", "6", "[1, 2, 3]", "undefined"],
    ),
    q(
      "js-filter",
      "Arrays and objects",
      "What does [1, 2, 3, 4].filter(n => n % 2 === 0) return?",
      ["[2, 4]", "[1, 3]", "2", "[false, true, false, true]"],
    ),
    q(
      "js-spread",
      "Arrays and objects",
      "After const a = { x: 1 }; const b = { ...a, x: 2 };, what is a.x?",
      ["1", "2", "undefined", "It throws a TypeError"],
    ),
    q(
      "js-reduce",
      "Arrays and objects",
      "What does [1, 2, 3].reduce((sum, n) => sum + n, 0) return?",
      ["6", "[1, 2, 3]", "0", '"123"'],
    ),
    q(
      "js-closure",
      "Functions and closures",
      "Given function counter() { let n = 0; return () => ++n; } and const next = counter();, what does the second call to next() return?",
      ["2", "1", "0", "undefined"],
    ),
    q(
      "js-arrow-this",
      "Functions and closures",
      "How does an arrow function get its this value?",
      [
        "From the surrounding scope where it was defined",
        "From the object that calls it",
        "It is always the global object",
        "From its first argument",
      ],
    ),
    q(
      "js-default-param",
      "Functions and closures",
      "Given function greet(name = 'guest') { return name; }, what does greet(undefined) return?",
      ['"guest"', "undefined", '"undefined"', "null"],
    ),
    q(
      "js-pure",
      "Functions and closures",
      "Which description fits a pure function?",
      [
        "It returns the same output for the same input and has no side effects",
        "It updates a global variable",
        "It reads the current time",
        "It writes to the console",
      ],
    ),
    q(
      "js-await",
      "Async and promises",
      "Inside an async function, what does await do with a pending Promise?",
      [
        "Pauses that function until the Promise settles",
        "Blocks the entire JavaScript runtime",
        "Always returns undefined immediately",
        "Cancels the Promise",
      ],
    ),
    q(
      "js-event-order",
      "Async and promises",
      "In what order is this logged? console.log('A'); setTimeout(() => console.log('B'), 0); Promise.resolve().then(() => console.log('C')); console.log('D');",
      ["A D C B", "A B C D", "A C D B", "A D B C"],
    ),
    q(
      "js-promise-all",
      "Async and promises",
      "What does Promise.all do when one of its Promises rejects?",
      [
        "It rejects with that reason",
        "It resolves with the other values",
        "It retries the rejected Promise",
        "It resolves with undefined in that position",
      ],
    ),
    q(
      "js-async-return",
      "Async and promises",
      "What does an async function always return?",
      [
        "A Promise",
        "The returned value directly",
        "undefined",
        "A callback function",
      ],
    ),
    q(
      "js-nullish",
      "Modern syntax and errors",
      "What is the value of 0 ?? 10?",
      ["0", "10", "null", "undefined"],
    ),
    q(
      "js-optional-chain",
      "Modern syntax and errors",
      "Given const user = {};, what is user.profile?.name?",
      ["undefined", "It throws a TypeError", "null", '""'],
    ),
    q(
      "js-rest",
      "Modern syntax and errors",
      "After const [first, ...rest] = [1, 2, 3];, what is rest?",
      ["[2, 3]", "2", "[1, 2, 3]", "[3]"],
    ),
    q(
      "js-finally",
      "Modern syntax and errors",
      "When does a finally block run?",
      [
        "After try and catch, whether or not an error was thrown",
        "Only when an error was thrown",
        "Only when no error was thrown",
        "Only when catch throws again",
      ],
    ),
  ],
  "web-accessibility": [
    q(
      "a11y-button",
      "Semantic HTML",
      "Which element is most appropriate for an action that opens a dialog?",
      [
        "A button with an accessible name",
        "A div with a click handler only",
        "A span styled to look clickable",
        "An image with a title attribute",
      ],
    ),
    q(
      "a11y-headings",
      "Semantic HTML",
      "How should headings be structured on a page?",
      [
        "In a logical order that reflects the content outline",
        "By the font size each level produces",
        "With a single heading per page at any level",
        "Replaced with bold paragraph text",
      ],
    ),
    q(
      "a11y-main",
      "Semantic HTML",
      "Which element identifies the primary content of a page for assistive technology?",
      [
        "<main>",
        '<div id="content">',
        "A <section> with large text",
        '<span role="text">',
      ],
    ),
    q(
      "a11y-link-or-button",
      "Semantic HTML",
      "When should a link be used instead of a button?",
      [
        "When activating it navigates to another location",
        "Whenever the control should look underlined",
        "When it submits a form",
        "Never; buttons work for everything",
      ],
    ),
    q(
      "a11y-alt",
      "Images and media",
      "An image is purely decorative and conveys no information. What alt attribute should it use?",
      ['alt=""', "No alt attribute", 'alt="image"', 'alt="decorative image"'],
    ),
    q(
      "a11y-alt-informative",
      "Images and media",
      "What should alt text for an informative image describe?",
      [
        "The information or function the image provides",
        "The image file name",
        'The word "image"',
        "The photographer's name",
      ],
    ),
    q(
      "a11y-captions",
      "Images and media",
      "What do people who are deaf or hard of hearing need for prerecorded video with speech?",
      [
        "Captions",
        "A higher video resolution",
        "Autoplay",
        "A louder default volume",
      ],
    ),
    q(
      "a11y-autoplay-audio",
      "Images and media",
      "Audio that plays automatically for more than 3 seconds must…",
      [
        "Offer a way to pause, stop or change its volume",
        "Loop continuously",
        "Start at full volume",
        "Be hidden from screen readers",
      ],
    ),
    q(
      "a11y-label",
      "Forms and labels",
      "How should a visible label be connected to a text input?",
      [
        "A label for attribute matching the input id",
        "By placing them next to each other only",
        "By using a placeholder instead of a label",
        "With a label hidden by aria-hidden",
      ],
    ),
    q(
      "a11y-color",
      "Forms and labels",
      "How should a form communicate an error accessibly?",
      [
        "Provide explanatory text, not color alone",
        "Use only a red border",
        "Hide the error text from assistive technology",
        "Clear the field without explanation",
      ],
    ),
    q(
      "a11y-required",
      "Forms and labels",
      "How should a required field be indicated?",
      [
        "In text or with the required attribute, not by color alone",
        "With a red label only",
        "Only after submission fails",
        "By making the field larger",
      ],
    ),
    q(
      "a11y-fieldset",
      "Forms and labels",
      "How should a group of related radio buttons be labelled?",
      [
        "With a fieldset and legend",
        "With placeholder text only",
        "With a heading elsewhere on the page",
        "Radio groups need no label",
      ],
    ),
    q(
      "a11y-keyboard",
      "Keyboard and focus",
      "What should keyboard users be able to do with interactive controls?",
      [
        "Reach and operate them with a visible focus indicator",
        "Reach them with Tab only, with no visible focus",
        "Use the mouse to activate them",
        "Operate them only with shortcut keys",
      ],
    ),
    q(
      "a11y-positive-tabindex",
      "Keyboard and focus",
      'What does a positive tabindex, such as tabindex="5", usually cause?',
      [
        "A focus order that differs from the visual order",
        "The element becomes hidden",
        "Faster keyboard navigation for everyone",
        "The element is announced five times",
      ],
    ),
    q(
      "a11y-dialog-focus",
      "Keyboard and focus",
      "When a modal dialog opens, where should keyboard focus go?",
      [
        "Into the dialog, staying there until it closes",
        "Stay on the page behind the dialog",
        "To the browser address bar",
        "To the end of the page",
      ],
    ),
    q(
      "a11y-skip-link",
      "Keyboard and focus",
      'What is a "skip to main content" link for?',
      [
        "Letting keyboard users bypass repeated navigation",
        "Improving search ranking",
        "Hiding the navigation from everyone",
        "Making the page load faster",
      ],
    ),
    q(
      "a11y-contrast-text",
      "Color and contrast",
      "What is the minimum WCAG AA contrast ratio for normal-size body text?",
      ["4.5:1", "2:1", "3:1", "7:1"],
    ),
    q(
      "a11y-contrast-large",
      "Color and contrast",
      "What minimum contrast does WCAG AA require for large text (about 24px, or 18.66px bold)?",
      ["3:1", "4.5:1", "7:1", "1.5:1"],
    ),
    q(
      "a11y-color-only",
      "Color and contrast",
      "A chart shows status using only red and green dots. What is the problem?",
      [
        "People with color vision deficiencies may not tell them apart",
        "Red and green make the page heavier",
        "Charts are not allowed on accessible pages",
        "There is no problem",
      ],
    ),
    q(
      "a11y-focus-visible",
      "Color and contrast",
      "Why must focus indicators have enough contrast?",
      [
        "So keyboard users can see where focus is",
        "So the page loads faster",
        "So mouse users can click more precisely",
        "Because browsers ignore low-contrast styles",
      ],
    ),
    q(
      "a11y-native-first",
      "ARIA and dynamic content",
      "What is the first rule of ARIA?",
      [
        "Use a native HTML element when one provides the behavior",
        "Add an ARIA role to every element",
        "Put aria-hidden on interactive controls",
        "ARIA removes the need for testing",
      ],
    ),
    q(
      "a11y-live-region",
      "ARIA and dynamic content",
      "How can a status message that appears without a page reload be announced to screen readers?",
      [
        'Place it in a live region such as role="status"',
        "Make the message blink",
        "Use a larger font",
        "Add a title attribute to the body",
      ],
    ),
    q(
      "a11y-hidden-focusable",
      "ARIA and dynamic content",
      'What happens to a focusable button inside an element with aria-hidden="true"?',
      [
        "It can still receive focus but is not announced, which is confusing",
        "It is removed from the page",
        "It is announced more prominently",
        "It is automatically disabled",
      ],
    ),
    q(
      "a11y-expanded",
      "ARIA and dynamic content",
      "Which attribute tells assistive technology whether a menu or disclosure button's content is open?",
      ["aria-expanded", "aria-label", "aria-live", "tabindex"],
    ),
  ],
};
const optionId = () => randomBytes(6).toString("base64url");
function shuffle<T>(items: T[], random: Random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
const topicOf = (bank: BankQuestion[], question: SkillQuestion) =>
  question.topic ?? bank.find((b) => b.id === question.id)?.topic ?? "General";
// Correct and total answers per topic for one graded snapshot.
export function topicBreakdown(
  assessmentId: string,
  snapshot: SkillSnapshot,
  answers: Record<string, string>,
) {
  const bank = banks[assessmentId] ?? [];
  const topics = new Map<string, { correct: number; total: number }>();
  for (const question of snapshot.questions) {
    const topic = topicOf(bank, question);
    const entry = topics.get(topic) ?? { correct: 0, total: 0 };
    entry.total++;
    if (answers[question.id] === question.correctOptionId) entry.correct++;
    topics.set(topic, entry);
  }
  return [...topics].map(([topic, value]) => ({ topic, ...value }));
}
// Builds a fresh question set: every topic once, the remaining slots on the
// topics this user missed most recently, preferring questions they have not
// seen and never repeating the previous attempt when the bank allows.
export function assessmentSnapshot(
  id: string,
  history: AttemptHistory = [],
  random: Random = secureRandom,
): SkillSnapshot | null {
  const summary = assessmentCatalog().assessments.find((a) => a.id === id);
  const bank = banks[id];
  if (!summary || !bank) return null;
  const topics = [...new Set(bank.map((b) => b.topic))];
  const seen = new Map<string, number>();
  for (const attempt of history)
    for (const question of attempt.snapshot.questions)
      seen.set(question.id, (seen.get(question.id) ?? 0) + 1);
  const previous = new Set(history[0]?.snapshot.questions.map((x) => x.id));
  const missRate = new Map<string, number>();
  for (const { topic, correct, total } of history
    .slice(0, 3)
    .flatMap((a) => topicBreakdown(id, a.snapshot, a.answers))) {
    const current = missRate.get(topic) ?? 0;
    missRate.set(topic, current + (total - correct) / total);
  }
  const slots = new Map(topics.map((t) => [t, 1]));
  const extras = summary.questionCount - topics.length;
  const unseen = (topic: string) =>
    bank.filter((b) => b.topic === topic && !seen.has(b.id)).length;
  // Weakest topics first; otherwise the topics with the most unseen questions.
  const ranked = shuffle(topics, random).sort(
    (a, b) =>
      (missRate.get(b) ?? 0) - (missRate.get(a) ?? 0) || unseen(b) - unseen(a),
  );
  for (const topic of ranked.slice(0, Math.max(0, extras))) slots.set(topic, 2);
  const picked: BankQuestion[] = [];
  for (const [topic, count] of slots) {
    const candidates = shuffle(
      bank.filter((b) => b.topic === topic),
      random,
    ).sort(
      (a, b) =>
        Number(previous.has(a.id)) - Number(previous.has(b.id)) ||
        (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0),
    );
    picked.push(...candidates.slice(0, count));
  }
  return {
    title: summary.title,
    skill: summary.skill,
    questions: shuffle(picked, random).map((question) => {
      const options = question.labels.map((label) => ({
        id: optionId(),
        label,
      }));
      return {
        id: question.id,
        topic: question.topic,
        prompt: question.prompt,
        options: shuffle(options, random),
        correctOptionId: options[0]!.id,
      };
    }),
  };
}
