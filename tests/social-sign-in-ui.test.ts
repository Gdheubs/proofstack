import { describe, expect, it, vi } from "vitest";

vi.mock("../artifacts/proofstack/hooks/use-auth", () => ({
  useAct: () => ({ raw: vi.fn(), act: vi.fn() }),
  useSession: () => ({ data: undefined }),
  errInfo: (e: unknown) => ({ message: String(e) }),
}));

const root = `${process.cwd()}/artifacts/proofstack`;
async function render(socialProviders: string[]) {
  const { createElement } = await import(`${root}/node_modules/react/index.js`);
  const { renderToStaticMarkup } = await import(
    `${root}/node_modules/react-dom/server.node.js`
  );
  const { SocialTab } = await import(`${root}/features/auth/auth-view.tsx`);
  return renderToStaticMarkup(
    createElement(SocialTab, {
      caps: { socialProviders },
      returnTo: { destination: "/community" },
    }),
  ) as string;
}
const buttons = (html: string) =>
  [...html.matchAll(/data-testid="button-oauth-([a-z_]+)"/g)].map((m) => m[1]);

describe("social sign-in buttons", () => {
  it("renders only enabled providers, in API order, with product names", async () => {
    const html = await render(["google", "azure", "linkedin_oidc", "x"]);
    expect(buttons(html)).toEqual(["google", "azure", "linkedin_oidc", "x"]);
    for (const label of ["Google", "Microsoft", "LinkedIn", "X"])
      expect(html).toContain(`Continue with ${label}`);
    expect(html).not.toContain("GitHub");
    expect(html).not.toContain("pending setup");
  });
  it("labels all eight supported providers", async () => {
    const all = [
      "google",
      "github",
      "azure",
      "linkedin_oidc",
      "gitlab",
      "discord",
      "x",
      "facebook",
    ];
    const html = await render(all);
    expect(buttons(html)).toEqual(all);
    for (const label of [
      "Google",
      "GitHub",
      "Microsoft",
      "LinkedIn",
      "GitLab",
      "Discord",
      "X",
      "Facebook",
    ])
      expect(html).toContain(`Continue with ${label}<`);
  });
  it("shows a notice instead of dead buttons when no provider is enabled", async () => {
    const html = await render([]);
    expect(buttons(html)).toEqual([]);
    expect(html).toContain("Social sign-in is not available yet.");
  });
});
