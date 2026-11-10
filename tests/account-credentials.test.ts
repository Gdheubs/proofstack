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
vi.mock("@/features/account/use-gate", () => ({
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
  "@/features/account/sections",
  () =>
    import(
      `${process.cwd()}/artifacts/proofstack/features/account/sections.tsx`
    ),
);
vi.mock(
  "@/features/auth/shared",
  () =>
    import(`${process.cwd()}/artifacts/proofstack/features/auth/shared.tsx`),
);
vi.mock("@/features/auth/mfa", () => ({
  MfaEnroll: () => null,
  StepUpDialog: () => "Step-up dialog",
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
  () => import(`${process.cwd()}/artifacts/proofstack/lib/utils.ts`),
);

afterEach(() => {
  state.stepUp = null;
  state.phoneOtp = false;
  state.account.memberships = [];
  vi.clearAllMocks();
});

async function renderAccount() {
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
    `${process.cwd()}/artifacts/proofstack/features/account/account-view.tsx`
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  client.setQueryData(["/api/auth/account"], state.account);
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(AccountView),
    ),
  );
}

it("renders credentials, factors and step-up without any provider lookup", async () => {
  state.phoneOtp = true;
  state.stepUp = {};
  const html = await renderAccount();
  for (const action of [
    "Change password",
    "Add factor",
    ">Remove<",
    "Generate backup codes",
    ">Recover<",
    "Send verification code",
    "Step-up dialog",
  ])
    expect(html).toContain(action);
  expect(html).toContain("Personal authenticator");
  expect(html).toContain("Profile");
  expect(html).toContain("Devices");
  expect(html).toContain("Security activity");
  expect(html).toContain("Organizations");
  expect(html).not.toContain("Loading credential configuration");
  expect(html).not.toContain("Social sign-in");
});

it("keeps organization authoring in Community and Account a membership summary", async () => {
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
  const html = await renderAccount();
  expect(html).not.toContain("Create organization");
  expect(html).not.toContain("Add or change a member");
  expect(html).not.toContain("Member Account ID");
  expect(html).not.toContain("Hidden member administration");
  expect(html).toContain('href="/organizations/builders"');
  expect(html).toContain("Builders");
  expect(html).toContain("Your role: owner");
  expect(html).toContain('href="/organizations"');
  expect(html).toContain("Manage organizations");
});

it("shows an organization empty state linked to its single management home", async () => {
  const html = await renderAccount();
  expect(html).toContain("You do not belong to an organization yet");
  expect(html).toContain('href="/organizations"');
  expect(html).not.toContain("Create organization");
  expect(html).not.toContain("Apply role");
});
