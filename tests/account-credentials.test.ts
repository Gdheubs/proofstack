import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  account: {
    user: {
      id: "viewer",
      displayName: "Viewer",
      kind: "developer",
      email: "viewer@example.com",
    },
    sessions: [],
    memberships: [] as Array<{
      organizationId: string;
      name: string;
      slug: string;
      role: string;
      members: Array<{ userId: string; displayName: string; role: string }>;
    }>,
    activity: [],
    factors: [
      {
        id: "native-factor",
        type: "totp",
        status: "verified",
        name: "Personal authenticator",
      },
    ],
    recoveryCodesRemaining: 0,
    passwordRecovery: false,
  },
  act: vi.fn(),
  raw: vi.fn(),
  settle: vi.fn(),
  stepUp: null as object | null,
  phoneOtp: false,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAct: () => ({
    act: state.act,
    raw: state.raw,
    stepUp: state.stepUp,
    settleStepUp: state.settle,
  }),
  errInfo: (error: unknown) => ({
    message: error instanceof Error ? error.message : "Request failed.",
  }),
}));
vi.mock("@/components/account/use-gate", () => ({
  useGate: () => ({
    ok: true,
    q: {},
    ctx: {
      user: state.account.user,
      factors: state.account.factors,
      capabilities: { phoneOtp: state.phoneOtp, totp: true, phoneMfa: false },
    },
  }),
}));
vi.mock(
  "@/components/account/sections",
  () =>
    import(
      `${process.cwd()}/artifacts/proofstack/components/account/sections.tsx`
    ),
);
vi.mock(
  "@/components/auth/shared",
  () =>
    import(`${process.cwd()}/artifacts/proofstack/components/auth/shared.tsx`),
);
vi.mock("@/components/auth/mfa", () => ({
  MfaEnroll: () => null,
  StepUpDialog: () => "Legacy step-up dialog",
}));
vi.mock(
  "@/components/ui/button",
  () =>
    import(
      `${process.cwd()}/artifacts/proofstack/src/components/ui/button.tsx`
    ),
);
vi.mock(
  "@/components/ui/input",
  () =>
    import(`${process.cwd()}/artifacts/proofstack/src/components/ui/input.tsx`),
);
vi.mock(
  "@/components/ui/alert-dialog",
  () =>
    import(
      `${process.cwd()}/artifacts/proofstack/src/components/ui/alert-dialog.tsx`
    ),
);
vi.mock(
  "@/lib/utils",
  () => import(`${process.cwd()}/artifacts/proofstack/src/lib/utils.ts`),
);

const publicConfig = {
  provider: "firebase",
  firebase: {
    apiKey: "public-browser-key",
    authDomain: "example.firebaseapp.com",
    projectId: "example",
    appId: "public-app-id",
  },
  providers: { google: true, github: true },
};
afterEach(() => {
  state.stepUp = null;
  state.phoneOtp = false;
  state.account.memberships = [];
  vi.clearAllMocks();
});

async function renderAccount(config: unknown = publicConfig, error?: Error) {
  const root = `${process.cwd()}/artifacts/proofstack/node_modules`;
  const React = await import(`${root}/react/index.js`);
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import(
    `${root}/react-dom/server.node.js`
  );
  const { QueryClient, QueryClientProvider } = await import(
    `${root}/@tanstack/react-query/build/modern/index.js`
  );
  const { AccountView } = await import(
    `${process.cwd()}/artifacts/proofstack/components/account/account-view.tsx`
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  client.setQueryData(["/api/auth/account"], state.account);
  if (config) client.setQueryData(["/api/auth/firebase/config"], config);
  if (error)
    client
      .getQueryCache()
      .build(client, { queryKey: ["/api/auth/firebase/config"] })
      .setState({ status: "error", error });
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(AccountView),
    ),
  );
}

it("renders Firebase social credentials and read-only native factors, never legacy actions", async () => {
  const html = await renderAccount();
  expect(html).not.toContain("Change password");
  expect(html).not.toContain("Add factor");
  expect(html).not.toContain(">Remove<");
  expect(html).not.toContain("Generate backup codes");
  expect(html).not.toContain(">Recover<");
  expect(html).toContain("Social sign-in");
  expect(html).toContain("external identity provider");
  expect(html).toContain("Personal authenticator");
  expect(html).toContain("Native verification");
  expect(html).toContain("enrollment and recovery are pending");
  expect(html).toContain("Profile");
  expect(html).toContain("Devices");
});

it("fails closed while configuration is pending without hiding common account data", async () => {
  const html = await renderAccount(null);
  expect(html).not.toContain("Change password");
  expect(html).not.toContain("Add factor");
  expect(html).not.toContain("Legacy step-up dialog");
  expect(html).toContain("Loading credential configuration");
  expect(html).toContain("Save profile");
  expect(html).toContain("Devices");
  expect(html).toContain("Security activity");
  expect(html).toContain("Organizations");
});

it("fails closed on configuration error even when stale configuration selected Supabase", async () => {
  const html = await renderAccount(
    { provider: "supabase" },
    new Error("configuration offline"),
  );
  expect(html).not.toContain("Change password");
  expect(html).not.toContain("Add factor");
  expect(html).not.toContain("Legacy step-up dialog");
  expect(html).toContain("configuration offline");
  expect(html).toContain("Retry");
  expect(html).toContain("Save profile");
  expect(html).toContain("Devices");
});

it("routes Firebase step-up to native provider sign-in, not the Supabase challenge", async () => {
  state.stepUp = {};
  const html = await renderAccount();
  expect(html).not.toContain("Legacy step-up dialog");
  expect(html).toContain("Confirm it is you");
  expect(html).toContain("native Firebase second-factor");
  expect(html).toContain("Sign out and verify again");
  expect(html).toContain("Cancel verification");
  const { restartFirebaseSignIn } = await import(
    `${process.cwd()}/artifacts/proofstack/components/account/sections.tsx`
  );
  const run = vi.fn(async () => ({ signedOut: true }));
  const cancel = vi.fn();
  const navigate = vi.fn();
  await restartFirebaseSignIn(run, cancel, navigate);
  expect(run).toHaveBeenCalledExactlyOnceWith({
    action: "logout",
    scope: "local",
  });
  expect(cancel).toHaveBeenCalledExactlyOnceWith(false);
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/auth");
});

it("does not offer legacy phone credential actions in Firebase even with stale capability flags", async () => {
  state.phoneOtp = true;
  const html = await renderAccount();
  expect(html).not.toContain("Send verification code");
});

it("does not redirect the Firebase journey unless the server confirms sign-out", async () => {
  const { restartFirebaseSignIn } = await import(
    `${process.cwd()}/artifacts/proofstack/components/account/sections.tsx`
  );
  const cancel = vi.fn();
  const navigate = vi.fn();
  await expect(
    restartFirebaseSignIn(
      async () => ({ message: "not signed out" }),
      cancel,
      navigate,
    ),
  ).rejects.toThrow("Sign-out was not confirmed");
  expect(cancel).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

it.each([publicConfig, { provider: "supabase" }, null])(
  "keeps organization authoring in Community and Account a membership summary (%s)",
  async (config) => {
    state.account.memberships = [
      {
        organizationId: "org-id",
        name: "Builders",
        slug: "builders",
        role: "organization_owner",
        members: [
          {
            userId: "member-id",
            displayName: "Hidden member administration",
            role: "organization_admin",
          },
        ],
      },
    ];
    const html = await renderAccount(config);
    expect(html).not.toContain("Create organization");
    expect(html).not.toContain("Add or change a member");
    expect(html).not.toContain("Member Account ID");
    expect(html).not.toContain("Hidden member administration");
    expect(html).toContain('href="/organizations/builders"');
    expect(html).toContain("Builders");
    expect(html).toContain("Your role: owner");
    expect(html).toContain('href="/organizations"');
    expect(html).toContain("Manage organizations");
  },
);

it("preserves legacy credentials and step-up only for an explicit settled Supabase provider", async () => {
  state.phoneOtp = true;
  state.stepUp = {};
  const html = await renderAccount({ provider: "supabase" });
  for (const action of [
    "Change password",
    "Add factor",
    ">Remove<",
    "Generate backup codes",
    ">Recover<",
    "Send verification code",
    "Legacy step-up dialog",
  ])
    expect(html).toContain(action);
  expect(html).not.toContain("Social sign-in");
  expect(html).not.toContain("native Firebase second-factor");
});

it.each([null, publicConfig, {}])(
  "fails closed on an error with absent, Firebase, or unrecognized cached configuration (%s)",
  async (config) => {
    const html = await renderAccount(
      config,
      new Error("configuration offline"),
    );
    expect(html).toContain("configuration offline");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Social sign-in");
    expect(html).not.toContain("Change password");
    expect(html).not.toContain("Add factor");
    expect(html).not.toContain("Legacy step-up dialog");
  },
);

it("does not default to legacy when a settled configuration is unrecognized", async () => {
  const html = await renderAccount({});
  expect(html).toContain("Authentication configuration is unavailable");
  expect(html).toContain("Retry");
  expect(html).not.toContain("Change password");
  expect(html).not.toContain("Add factor");
});

it("keeps failed Firebase sign-out in place instead of continuing the protected action", async () => {
  const { restartFirebaseSignIn } = await import(
    `${process.cwd()}/artifacts/proofstack/components/account/sections.tsx`
  );
  const cancel = vi.fn();
  const navigate = vi.fn();
  await expect(
    restartFirebaseSignIn(
      async () => {
        throw new Error("logout offline");
      },
      cancel,
      navigate,
    ),
  ).rejects.toThrow("logout offline");
  expect(cancel).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

it("shows an organization empty state linked to its single management home", async () => {
  const html = await renderAccount();
  expect(html).toContain("You do not belong to an organization yet");
  expect(html).toContain('href="/organizations"');
  expect(html).not.toContain("Create organization");
  expect(html).not.toContain("Apply role");
});
