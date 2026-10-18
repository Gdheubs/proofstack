import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const session = vi.hoisted(() => ({
  csrf: "csrf",
  canAct: true,
  session: {
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: { authenticated: true, mfaRequired: false, user: { id: "viewer" } },
  },
}));
vi.mock("../artifacts/proofstack/hooks/use-community", () => ({
  useCsrf: () => session,
}));

const componentRoot = `${process.cwd()}/artifacts/proofstack/features/assessments`;
const loadApi = () => import(`${componentRoot}/assessment-api.ts`);
const loadPanels = () => import(`${componentRoot}/assessment-panels.tsx`);

describe("assessment route integration", () => {
  it("renders the catalog route", async () => {
    const { default: Page } = await import(
      `${process.cwd()}/artifacts/proofstack/app/(community)/assessments/page.tsx`
    );
    expect(await renderConnected(Page, {})).toContain("Loading skill checks");
  });
  it("passes the exact route attempt id into the attempt view", async () => {
    const { default: Page } = await import(
      `${process.cwd()}/artifacts/proofstack/app/(community)/assessments/[id]/page.tsx`
    );
    const element = await Page({
      params: Promise.resolve({ id: "exact-attempt-id" }),
    });
    expect(element.props.id).toBe("exact-attempt-id");
  });
  it("uses the owner-only me fallback for an unclaimed profile and passes its identity", () => {
    const source = readFileSync(
      `${process.cwd()}/artifacts/proofstack/features/community/profile-view.tsx`,
      "utf8",
    );
    expect(source).toContain("ProfileAssessmentResults");
    expect(source).toContain('handle={p.handle || (p.isMe ? "me" : "")}');
    expect(source).toContain("ownerId={p.id}");
    expect(source).toContain("isMe={p.isMe}");
  });
});
async function renderConnected(
  component: unknown,
  props: Record<string, unknown>,
  seed: Array<[unknown[], unknown]> = [],
) {
  return (await renderConnectedState(component, props, seed)).html;
}
async function renderConnectedState(
  component: unknown,
  props: Record<string, unknown>,
  seed: Array<[unknown[], unknown]> = [],
) {
  const root = `${process.cwd()}/artifacts/proofstack/node_modules`;
  const { createElement } = await import(`${root}/react/index.js`);
  const { renderToStaticMarkup } = await import(
    `${root}/react-dom/server.node.js`
  );
  const { QueryClient, QueryClientProvider } = await import(
    `${root}/@tanstack/react-query/build/modern/index.js`
  );
  const { AppRouterContext } = await import(
    `${root}/next/dist/shared/lib/app-router-context.shared-runtime.js`
  );
  const client = new QueryClient();
  for (const [key, data] of seed) client.setQueryData(key, data);
  const renderWithProps = (nextProps: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          AppRouterContext.Provider,
          { value: { push: vi.fn() } },
          createElement(component, nextProps),
        ),
      ),
    );
  return { html: renderWithProps(props), client, renderWithProps };
}
async function render(component: unknown, props: Record<string, unknown>) {
  const root = `${process.cwd()}/artifacts/proofstack/node_modules`;
  const { createElement } = await import(`${root}/react/index.js`);
  const { renderToStaticMarkup } = await import(
    `${root}/react-dom/server.node.js`
  );
  return renderToStaticMarkup(createElement(component, props));
}
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });

it("prevents double submissions while a request is outstanding and releases after failure", async () => {
  const { createAssessmentActionGuard } = await loadApi();
  const guard = createAssessmentActionGuard();
  let finish!: () => void;
  const action = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const first = guard.run(action);
  expect(await guard.run(action)).toBeUndefined();
  expect(action).toHaveBeenCalledOnce();
  finish();
  await first;
  await expect(
    guard.run(async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  expect(await guard.run(async () => "retry")).toBe("retry");
});

const attempt = {
  id: "attempt-one",
  assessmentId: "javascript",
  title: "JavaScript foundations",
  skill: "JavaScript",
  status: "in_progress",
  questions: [
    {
      id: "q-one",
      prompt: "Which value is a number?",
      options: [
        { id: "a", label: "42" },
        { id: "b", label: "hello" },
      ],
    },
  ],
};

describe("assessment catalog UI", () => {
  it("shows the real check description and metadata with a sign-in action for visitors", async () => {
    const { AssessmentCatalogContent } = await loadPanels();
    const html = await render(AssessmentCatalogContent, {
      assessments: [
        {
          id: "javascript",
          title: attempt.title,
          skill: "JavaScript",
          description: "Values, functions and control flow.",
          questionCount: 5,
          durationMinutes: 10,
        },
      ],
      canAct: false,
      sessionPending: false,
      pendingId: null,
      onStart: vi.fn(),
    });
    expect(html).toContain("JavaScript foundations");
    expect(html).toContain("Values, functions and control flow.");
    expect(html).toContain("5 questions");
    expect(html).toContain("10 min");
    expect(html).toContain('class="grid gap-4 sm:grid-cols-2"');
    expect(html).not.toContain("lg:grid-cols-3");
    expect(html).toContain("Sign in to start");
    expect(html).toContain('href="/auth');
    expect(html).toContain("not proctored");
    expect(html).not.toContain("Start check</button>");
  });
  it("connects the catalog route to a real query with a loading state", async () => {
    const { AssessmentCatalogView } = await import(
      `${componentRoot}/assessment-catalog.tsx`
    );
    const html = await renderConnected(AssessmentCatalogView, {});
    expect(html).toContain("Loading skill checks");
  });
});

describe("question UI", () => {
  it("renders one accessible radio question and prevents incomplete submission", async () => {
    const { AssessmentQuestions } = await loadPanels();
    const html = await render(AssessmentQuestions, {
      attempt: {
        ...attempt,
        questions: [
          ...attempt.questions,
          { ...attempt.questions[0], id: "q-two", prompt: "A later question" },
        ],
      },
      index: 0,
      answers: {},
      pending: false,
      canSubmit: true,
      onAnswer: vi.fn(),
      onNavigate: vi.fn(),
      onSubmit: vi.fn(),
    });
    expect(html).toContain("Which value is a number?");
    expect(html).not.toContain("A later question");
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain('type="radio"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Question 1 of 2");
    expect(html).toMatch(/disabled=""[^>]*>Previous/);
    expect(html).toMatch(/disabled=""[^>]*>Submit answers/);
  });
  it("keeps answers selected when navigating and disables controls during submission", async () => {
    const { AssessmentQuestions } = await loadPanels();
    const html = await render(AssessmentQuestions, {
      attempt,
      index: 0,
      answers: { "q-one": "a" },
      pending: true,
      canSubmit: true,
      onAnswer: vi.fn(),
      onNavigate: vi.fn(),
      onSubmit: vi.fn(),
    });
    expect(html).toContain('checked=""');
    expect(html).toContain("Checking result…");
    expect(html).toContain('<fieldset disabled=""');
  });
});

describe("assessment requests", () => {
  it("loads only the same-origin catalog without caching or dropping abort signals", async () => {
    const { getAssessmentCatalog } = await loadApi();
    const signal = new AbortController().signal;
    const request = vi.fn(async () => reply({ assessments: [] }));
    expect(await getAssessmentCatalog(signal, request)).toEqual({
      assessments: [],
    });
    expect(request).toHaveBeenCalledWith("/api/assessments", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  });
  it("starts a check with CSRF and refuses to send without a security token", async () => {
    const { startAssessment } = await loadApi();
    const request = vi.fn(async () => reply(attempt));
    await expect(startAssessment("javascript", "", request)).rejects.toThrow(
      "Security token",
    );
    expect(request).not.toHaveBeenCalled();
    expect(await startAssessment("javascript", "csrf", request)).toEqual(
      attempt,
    );
    expect(request).toHaveBeenCalledWith("/api/assessments/start", {
      credentials: "same-origin",
      cache: "no-store",
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "csrf" },
      body: JSON.stringify({ assessmentId: "javascript" }),
    });
  });
});

describe("assessment submission", () => {
  it("requires valid answers for every question and verifies the completed exact attempt after POST", async () => {
    const { submitAssessment, hasAllAnswers } = await loadApi();
    const result = {
      id: "result-one",
      assessmentId: "javascript",
      title: attempt.title,
      skill: "JavaScript",
      score: 100,
      correct: 1,
      total: 1,
      remark: "Foundation knowledge demonstrated",
      completedAt: "2026-10-14T10:00:00Z",
    };
    const completed = { ...attempt, status: "completed", result };
    const calls: Array<
      [Parameters<typeof fetch>[0], Parameters<typeof fetch>[1]]
    > = [];
    const request = vi.fn(
      async (
        path: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        calls.push([path, init]);
        return reply(
          init?.method === "POST"
            ? { ...completed, result: { ...result, score: 0 } }
            : completed,
        );
      },
    );
    expect(hasAllAnswers(attempt.questions, {})).toBe(false);
    expect(hasAllAnswers(attempt.questions, { "q-one": "unknown" })).toBe(
      false,
    );
    expect(hasAllAnswers([], {})).toBe(false);
    await expect(
      submitAssessment(attempt, {}, "csrf", request),
    ).rejects.toThrow("Answer every question");
    expect(request).not.toHaveBeenCalled();
    expect(
      await submitAssessment(attempt, { "q-one": "a" }, "csrf", request),
    ).toEqual(completed);
    expect(calls).toEqual([
      [
        "/api/assessments/attempts/attempt-one/submit",
        {
          credentials: "same-origin",
          cache: "no-store",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": "csrf",
          },
          body: JSON.stringify({ answers: { "q-one": "a" } }),
        },
      ],
      [
        "/api/assessments/attempts/attempt-one",
        { credentials: "same-origin", cache: "no-store", signal: undefined },
      ],
    ]);
  });
  it.each([
    { ...attempt },
    { ...attempt, status: "completed" },
    {
      ...attempt,
      id: "wrong-target",
      status: "completed",
      result: { id: "result" },
    },
  ])(
    "does not show success when read-back is unconfirmed (%s)",
    async (readback) => {
      const { submitAssessment } = await loadApi();
      await expect(
        submitAssessment(attempt, { "q-one": "a" }, "csrf", async () =>
          reply(readback),
        ),
      ).rejects.toThrow("not confirmed");
    },
  );
});

describe("profile assessment results", () => {
  it("requests exactly the supplied public handle without guessing results", async () => {
    const { getAssessmentResults } = await loadApi();
    const signal = new AbortController().signal;
    const request = vi.fn(async () => reply({ results: [] }));
    expect(await getAssessmentResults("a handle/+", signal, request)).toEqual({
      results: [],
    });
    expect(request).toHaveBeenCalledWith(
      "/api/assessments/results?handle=a%20handle%2F%2B",
      { credentials: "same-origin", cache: "no-store", signal },
    );
  });
  it.each([
    [{ loading: true }, "Loading skill-check results"],
    [{ error: new Error("Results unavailable") }, "Results unavailable"],
    [{ results: [] }, "No completed skill checks yet"],
  ])(
    "renders loading, error, and empty as distinct honest states (%s)",
    async (props, text) => {
      const { AssessmentResultsContent } = await loadPanels();
      const html = await render(AssessmentResultsContent, {
        ...props,
        isMe: true,
        onRetry: vi.fn(),
      });
      expect(html).toContain(text);
      expect(html).not.toContain("100%");
    },
  );
  it("shows only server scores, remarks, dates and transparent limitations", async () => {
    const { AssessmentResultsContent } = await loadPanels();
    const html = await render(AssessmentResultsContent, {
      results: [
        {
          id: "saved-result",
          assessmentId: "javascript",
          title: attempt.title,
          skill: "JavaScript",
          score: 60,
          correct: 3,
          total: 5,
          remark: "Keep building your foundations",
          completedAt: "2026-10-14T10:00:00Z",
        },
      ],
      isMe: false,
      onRetry: vi.fn(),
    });
    expect(html).toContain("60%");
    expect(html).toContain("3 of 5 correct");
    expect(html).toContain("Keep building your foundations");
    expect(html).toMatch(/datetime="2026-10-14T10:00:00Z"/i);
    expect(html).toContain("Oct 14, 2026");
    expect(html).toContain("equally weighted");
    expect(html).toContain("not proctored");
    expect(html).not.toContain("expert");
    expect(html).not.toContain("Take a skill check");
    // A single completed check occupies the result row, not an empty half-grid.
    expect(html).not.toContain("lg:grid-cols-2");
  });
  it("embeds results from the public handle query", async () => {
    const { ProfileAssessmentResults } = await import(
      `${componentRoot}/profile-assessment-results.tsx`
    );
    const html = await renderConnected(
      ProfileAssessmentResults,
      { handle: "public-person", ownerId: "public-owner", isMe: false },
      [[["assessment-results", "public-person"], { results: [] }]],
    );
    expect(html).toContain("No completed skill checks yet");
    expect(html).not.toContain("Take a skill check");
  });
  it("renders saved unclaimed-owner results without sharing the me cache across owners", async () => {
    const { ProfileAssessmentResults } = await import(
      `${componentRoot}/profile-assessment-results.tsx`
    );
    const savedResult = {
      id: "saved-owner-result",
      assessmentId: "javascript",
      title: attempt.title,
      skill: "JavaScript",
      score: 60,
      correct: 3,
      total: 5,
      remark: "Private owner-one result",
      completedAt: "2026-10-14T10:00:00Z",
    };
    const { html, renderWithProps } = await renderConnectedState(
      ProfileAssessmentResults,
      { handle: "me", ownerId: "owner-one", isMe: true },
      [
        [["assessment-results", "me", "owner-one"], { results: [savedResult] }],
        [["assessment-results", "me", "owner-two"], { results: [] }],
        [
          ["assessment-results", "me"],
          { results: [{ ...savedResult, remark: "Legacy unscoped result" }] },
        ],
      ],
    );
    expect(html).toContain("Private owner-one result");
    expect(html).toContain("60%");
    expect(html).not.toContain("Legacy unscoped result");
    const otherOwnerHtml = renderWithProps({
      handle: "me",
      ownerId: "owner-two",
      isMe: true,
    });
    expect(otherOwnerHtml).toContain("No completed skill checks yet");
    expect(otherOwnerHtml).not.toContain("Private owner-one result");
    expect(otherOwnerHtml).not.toContain("Legacy unscoped result");
    const uncachedOwnerHtml = renderWithProps({
      handle: "me",
      ownerId: "owner-three",
      isMe: true,
    });
    expect(uncachedOwnerHtml).toContain("Loading skill-check results");
    expect(uncachedOwnerHtml).not.toContain("Private owner-one result");
    expect(uncachedOwnerHtml).not.toContain("Legacy unscoped result");
  });
  it.each([
    [{ handle: "me", isMe: true }, false],
    [{ handle: "me", ownerId: "", isMe: true }, false],
    [{ handle: "me", ownerId: "other-owner", isMe: false }, false],
    [{ handle: "", ownerId: "other-owner", isMe: false }, false],
    [{ handle: "me", ownerId: "owner-one", isMe: true }, true],
    [{ handle: "public-person", isMe: false }, true],
  ])(
    "only enables a valid public or identified owner query (%s)",
    async (props, enabled) => {
      const { ProfileAssessmentResults } = await import(
        `${componentRoot}/profile-assessment-results.tsx`
      );
      const { client } = await renderConnectedState(
        ProfileAssessmentResults,
        props,
      );
      const queries = client.getQueryCache().getAll();
      expect(queries).toHaveLength(1);
      expect(queries[0].options.enabled).toBe(enabled);
      if (enabled) {
        const request = vi.fn(async () => reply({ results: [] }));
        vi.stubGlobal("fetch", request);
        try {
          await queries[0].fetch();
          expect(request).toHaveBeenCalledWith(
            `/api/assessments/results?handle=${props.handle}`,
            {
              credentials: "same-origin",
              cache: "no-store",
              signal: expect.any(AbortSignal),
            },
          );
        } finally {
          vi.unstubAllGlobals();
        }
      }
    },
  );
  it("reloads the exact attempt and renders only its saved completion result", async () => {
    const { AssessmentAttemptView } = await import(
      `${componentRoot}/assessment-attempt.tsx`
    );
    const result = {
      id: "saved",
      assessmentId: "javascript",
      title: attempt.title,
      skill: "JavaScript",
      score: 60,
      correct: 3,
      total: 5,
      remark: "Saved by server",
      completedAt: "2026-10-14T10:00:00Z",
    };
    const html = await renderConnected(
      AssessmentAttemptView,
      { id: attempt.id },
      [
        [
          ["assessment-attempt", "viewer", attempt.id],
          { ...attempt, status: "completed", result },
        ],
      ],
    );
    expect(html).toContain("Check completed");
    expect(html).toContain("Saved by server");
    expect(html).not.toContain('type="radio"');
  });
});
