import { describe, expect, it, vi } from "vitest";
import {
  createAuthReturn,
  safeAuthReturn,
} from "../artifacts/proofstack/lib/auth-return";

const ui = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  isError: false,
  mfaRequired: false,
}));
vi.mock(
  "../artifacts/proofstack/node_modules/react/index.js",
  async (original) => ({
    ...(await original()),
    useEffect: (effect: () => void) => {
      ui.effects.push(effect);
    },
  }),
);

vi.mock("../artifacts/proofstack/hooks/use-auth", () => ({
  useSession: () => ({
    isLoading: false,
    isError: ui.isError,
    data: { authenticated: true, mfaRequired: ui.mfaRequired },
  }),
  useAct: () => ({ act: vi.fn(), refresh: vi.fn() }),
  errInfo: () => ({ message: "Request failed" }),
}));

describe("safe post-sign-in destinations", () => {
  it.each([
    "/account",
    "/assessments",
    "/assessments/javascript",
    "/assessments/attempt_123-abc",
  ])("preserves an allowlisted skill-check destination (%s)", (path) =>
    expect(safeAuthReturn(path)).toBe(path),
  );
  it.each([
    null,
    undefined,
    "",
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/assessments/../auth",
    "/auth",
    "/api/auth/logout",
    "/unknown",
    "/assessments//evil",
    "/assessments/a/b",
    "/assessments/a?token=secret",
    "/assessments#secret",
    "/assessments\n",
    "/assessments/\u0000",
    "%2Fassessments",
    "/%2F%2Fevil.test",
    "/assessments/%2e%2e",
    "/assessments/%252e%252e",
    "/assessments/%5c",
    "/assessments/%0a",
  ])("rejects unsafe, unrecognized or encoded paths (%s)", (path) => {
    expect(safeAuthReturn(path)).toBe("/account");
  });
});

function tabStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe("tab-local return destination", () => {
  it("survives a provider round trip and consumes only after full MFA authentication", () => {
    const storage = tabStorage();
    const entered = createAuthReturn(
      "?next=%2Fassessments%2Fattempt-123",
      storage,
    );
    expect(entered.destination).toBe("/assessments/attempt-123");
    expect(storage.setItem).toHaveBeenCalledWith(
      expect.any(String),
      "/assessments/attempt-123",
    );
    const callback = createAuthReturn("", storage);
    const replace = vi.fn();
    expect(callback.complete(undefined, replace)).toBe(false);
    expect(
      callback.complete({ authenticated: false, mfaRequired: false }, replace),
    ).toBe(false);
    expect(
      callback.complete({ authenticated: true, mfaRequired: true }, replace),
    ).toBe(false);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(
      callback.complete({ authenticated: true, mfaRequired: false }, replace),
    ).toBe(true);
    expect(replace).toHaveBeenCalledWith("/assessments/attempt-123");
    expect(storage.removeItem).toHaveBeenCalledOnce();
    callback.complete({ authenticated: true, mfaRequired: false }, replace);
    expect(replace).toHaveBeenCalledOnce();
    expect(createAuthReturn("", storage).destination).toBe("/account");
    expect(createAuthReturn("", tabStorage()).destination).toBe("/account");
  });
  it.each([
    "?next=%2F%2Fevil.test",
    "?next=%252Fassessments",
    "?next=%2Fassessments%2F%255c",
    "?next=",
    "?next=%2Fassessments&next=%2Faccount",
  ])(
    "rejects invalid query destinations instead of reusing an earlier tab destination (%s)",
    (search) => {
      const storage = tabStorage();
      createAuthReturn("?next=%2Fassessments", storage);
      expect(createAuthReturn(search, storage).destination).toBe("/account");
    },
  );
  it("revalidates tampered stored values and never persists unrelated query secrets", () => {
    const storage = tabStorage();
    createAuthReturn("?next=%2Fassessments&code=secret&token=secret", storage);
    expect(
      storage.setItem.mock.calls.every(([, value]) => value === "/assessments"),
    ).toBe(true);
    const key = storage.setItem.mock.calls[0]![0];
    storage.setItem(key, "//evil.test");
    expect(createAuthReturn("", storage).destination).toBe("/account");
  });
  it("continues safely when browser storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("disabled");
      },
      setItem: () => {
        throw new Error("disabled");
      },
      removeItem: () => {
        throw new Error("disabled");
      },
    };
    expect(createAuthReturn("", storage).destination).toBe("/account");
    const selected = createAuthReturn("?next=%2Fassessments", storage);
    const replace = vi.fn();
    selected.complete({ authenticated: true, mfaRequired: false }, replace);
    expect(replace).toHaveBeenCalledWith("/assessments");
  });
});

async function renderFirebaseReturnView() {
  ui.effects = [];
  const root = `${process.cwd()}/artifacts/proofstack/node_modules`;
  const { createElement } = await import(`${root}/react/index.js`);
  const { renderToStaticMarkup } = await import(
    `${root}/react-dom/server.node.js`
  );
  const { AppRouterContext } = await import(
    `${root}/next/dist/shared/lib/app-router-context.shared-runtime.js`
  );
  const { BrowserFirebaseAuth } = await import(
    `${process.cwd()}/artifacts/proofstack/components/auth/browser-firebase-auth.tsx`
  );
  const replace = vi.fn();
  const html = renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: { replace } },
      createElement(BrowserFirebaseAuth, {
        config: { provider: "firebase", firebase: {}, providers: {} },
        returnTo: createAuthReturn("?next=%2Fassessments%2Fattempt-123"),
      }),
    ),
  );
  expect(ui.effects.length).toBeGreaterThan(0);
  ui.effects[0]!();
  return { html, replace };
}

it("renders and replaces to the validated skill-check destination after Firebase authentication", async () => {
  const { html, replace } = await renderFirebaseReturnView();
  expect(html).toContain('href="/assessments/attempt-123"');
  expect(html).not.toContain('href="/account"');
  expect(replace).toHaveBeenCalledWith("/assessments/attempt-123");
});

it.each([
  [true, false],
  [false, true],
])(
  "does not redirect a stale failed session or an outstanding MFA requirement (%s/%s)",
  async (isError, mfaRequired) => {
    ui.isError = isError;
    ui.mfaRequired = mfaRequired;
    try {
      const { html, replace } = await renderFirebaseReturnView();
      expect(replace).not.toHaveBeenCalled();
      expect(html).not.toContain('href="/assessments/attempt-123"');
    } finally {
      ui.isError = false;
      ui.mfaRequired = false;
    }
  },
);
