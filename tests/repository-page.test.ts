import { describe, expect, it, vi } from "vitest";

// Inspect the actual server page's handoff without rendering client hooks.
vi.mock("@/components/repositories/repository-view", () => ({
  RepositoryView: () => null,
}));
vi.mock("@/components/repositories/repository-list", () => ({
  RepositoryList: () => null,
}));
vi.mock("@/components/careers/workspace", () => ({
  Applications: () => null,
}));
vi.mock("@/components/community/ui", () => ({
  PageHead: () => null,
}));
const frontend = `${process.cwd()}/artifacts/proofstack`;
async function Page(input: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Match the existing frontend tests: Next's TSX is checked by its own tsconfig.
  const { default: render } = await import(
    `${frontend}/app/(community)/repositories/[id]/page.tsx`
  );
  return render(input);
}

const routeId = "11111111-1111-4111-8111-111111111111";

describe("repository page query boundary", () => {
  it("leaves absent query selectors undefined", async () => {
    const page = await Page({
      params: Promise.resolve({ id: routeId }),
      searchParams: Promise.resolve({}),
    });
    expect(page.props).toEqual({
      id: routeId,
      branch: undefined,
      path: undefined,
      revision: undefined,
    });
  });
  it("keeps the route ID authoritative and forwards only supported query props", async () => {
    const page = await Page({
      params: Promise.resolve({ id: routeId }),
      searchParams: Promise.resolve({
        id: "22222222-2222-4222-8222-222222222222",
        branch: "feature/navigation",
        path: "src/index.ts",
        revision: "a".repeat(40),
        canManage: "true",
      }),
    });
    expect(page.props).toEqual({
      id: routeId,
      branch: "feature/navigation",
      path: "src/index.ts",
      revision: "a".repeat(40),
    });
  });
  it.each(["branch", "path", "revision"] as const)(
    "ignores repeated %s values rather than passing an array to the client",
    async (field) => {
      const page = await Page({
        params: Promise.resolve({ id: routeId }),
        searchParams: Promise.resolve({
          branch: "main",
          path: "src/index.ts",
          revision: "a".repeat(40),
          [field]: ["first", "second"],
        }),
      });
      expect(page.props[field]).toBeUndefined();
      expect(page.props.id).toBe(routeId);
    },
  );
  it("keys client state only by the route and normalized supported selectors", async () => {
    const render = (query: Record<string, string>) =>
      Page({
        params: Promise.resolve({ id: routeId }),
        searchParams: Promise.resolve(query),
      });
    const original = await render({ branch: "main" });
    expect((await render({ branch: "main", key: "injected" })).key).toBe(
      original.key,
    );
    expect((await render({ branch: "feature" })).key).not.toBe(original.key);
  });
});

describe("sibling page query boundaries", () => {
  it.each([
    ["repositories", "project", "projectId"],
    ["career/applications", "job", "jobId"],
  ])("ignores repeated query filters on %s", async (route, query, prop) => {
    const { default: render } = await import(
      `${frontend}/app/(community)/${route}/page.tsx`
    );
    const page = await render({
      searchParams: Promise.resolve({ [query]: [routeId, routeId] }),
    });
    const child = route === "repositories" ? page : page.props.children[1];
    expect(child.props[prop]).toBeUndefined();
  });
  it.each([
    ["repositories", "project", "projectId"],
    ["career/applications", "job", "jobId"],
  ])(
    "preserves scalar and absent filters on %s",
    async (route, query, prop) => {
      const { default: render } = await import(
        `${frontend}/app/(community)/${route}/page.tsx`
      );
      for (const value of [routeId, "", undefined]) {
        const page = await render({
          searchParams: Promise.resolve({ [query]: value }),
        });
        const child = route === "repositories" ? page : page.props.children[1];
        expect(child.props[prop]).toBe(value);
      }
    },
  );
});
