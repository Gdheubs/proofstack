import { afterEach, describe, expect, it, vi } from "vitest";

const surface = vi.hoisted(() => ({ tab: "releases" }));
// SSR has no tab clicks. Select a panel at the UI boundary; all page, query,
// pagination, record-list and card components below remain real.
vi.mock("../artifacts/proofstack/src/components/ui/tabs", async () => {
  const { createElement } = await import(
    `${process.cwd()}/artifacts/proofstack/node_modules/react/index.js`
  );
  const container = ({ children }: { children: unknown }) =>
    createElement("div", null, children);
  return {
    Tabs: container,
    TabsList: container,
    TabsTrigger: ({ children }: { children: unknown }) =>
      createElement("button", { role: "tab" }, children),
    TabsContent: ({ value, children }: { value: string; children: unknown }) =>
      value === surface.tab
        ? createElement("section", { role: "tabpanel" }, children)
        : null,
  };
});

const components = `${process.cwd()}/artifacts/proofstack/features/community`;
const dependencies = `${process.cwd()}/artifacts/proofstack/node_modules`;

async function connected(
  component: unknown,
  props: Record<string, unknown>,
  seeds: Array<[unknown[], unknown]>,
) {
  const { createElement } = await import(`${dependencies}/react/index.js`);
  const { renderToStaticMarkup } = await import(
    `${dependencies}/react-dom/server.node.js`
  );
  const { QueryClient, QueryClientProvider } = await import(
    `${dependencies}/@tanstack/react-query/build/modern/index.js`
  );
  const { AppRouterContext } = await import(
    `${dependencies}/next/dist/shared/lib/app-router-context.shared-runtime.js`
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity },
    },
  });
  for (const [key, data] of seeds) client.setQueryData(key, data);
  const render = (nextProps = props) =>
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
  return { client, render };
}

async function communityKey(params: Record<string, unknown>) {
  const { getGetCommunityQueryKey } = await import(
    `${process.cwd()}/lib/api-client-react/src/generated/api.ts`
  );
  return getGetCommunityQueryKey(params);
}

const person = {
  id: "person-one",
  handle: "builder",
  displayName: "Builder",
  kind: "developer",
  skills: [],
  followers: 0,
  following: 0,
  isMe: false,
};
const project = (index: number) => ({
  id: `project-${index}`,
  slug: `project-${index}`,
  title: `Project ${index}`,
  visibility: "public",
  owner: person,
  contributors: [],
  screenshots: [],
  technologies: [],
  entries: [],
  canEdit: false,
  canContribute: false,
});
const profilePage = (offset = 0, count = 20, hasMore = true) => ({
  profile: person,
  projects: Array.from({ length: count }, (_, i) => project(offset + i + 1)),
  entries: [],
  activity: [],
  offset,
  hasMore,
});

afterEach(() => vi.unstubAllGlobals());

describe("manual project and organization navigation", () => {
  it("names project record tabs separately from the hosted Git repository", async () => {
    surface.tab = "releases";
    const { ProjectView } = await import(`${components}/project-view.tsx`);
    const { render } = await connected(ProjectView, { slug: "project-1" }, [
      [
        await communityKey({ view: "project", handle: "project-1" }),
        { project: project(1) },
      ],
    ]);
    const html = render();
    expect(html).toContain('role="tab">Release records</button>');
    expect(html).toContain('role="tab">Repository links</button>');
    expect(html).toContain("Hosted repository");
    expect(html).toContain('href="/repositories?project=project-1"');
    expect(html).toContain("Manual release records");
    expect(html).toContain("Git releases");
    surface.tab = "repos";
    const repositoryHtml = render();
    expect(repositoryHtml).toContain("Manual repository links");
    expect(repositoryHtml).toContain("hosted Git");
  });

  it("explains organization repository links only to members", async () => {
    surface.tab = "repos";
    const { OrgView } = await import(`${components}/org-view.tsx`);
    const key = await communityKey({ view: "organization", handle: "org-one" });
    const organization = {
      id: "org-one",
      name: "Organization one",
      visibility: "public",
      memberCount: 1,
      myRole: "member",
      canManage: false,
      projects: [],
      repositories: [],
    };
    const { client, render } = await connected(OrgView, { slug: "org-one" }, [
      [key, { organization }],
    ]);
    const html = render();
    expect(html).toContain('role="tab">Repository links</button>');
    expect(html).toContain("Manual repository links");
    expect(html).toContain("hosted Git");
    expect(html).toContain("No records yet");
    client.setQueryData(key, {
      organization: { ...organization, myRole: null },
    });
    const publicHtml = render();
    expect(publicHtml).not.toContain("Repository links");
    expect(publicHtml).not.toContain("Manual repository links");
  });
});

describe("profile project pagination", () => {
  it("reaches projects beyond the first 20 using the same profile query and a load-more control", async () => {
    surface.tab = "projects";
    const { ProfileView } = await import(`${components}/profile-view.tsx`);
    const key = await communityKey({ view: "profile", handle: "builder" });
    const { client, render } = await connected(
      ProfileView,
      { handle: "builder" },
      [
        [key, profilePage()],
        [[...key, "pages"], { pages: [profilePage()], pageParams: [0] }],
        [["assessment-results", "builder"], { results: [] }],
      ],
    );
    const initialHtml = render();
    expect(initialHtml).toContain('href="/projects/project-20"');
    expect(initialHtml).not.toContain('href="/projects/project-21"');
    expect(initialHtml).toContain("Load more");

    const query = client
      .getQueryCache()
      .find({ queryKey: [...key, "pages"], exact: true });
    expect(query?.options.queryFn).toBeTypeOf("function");
    const request = vi.fn<(input: unknown) => Promise<Response>>(
      async (input) => {
        const offset = Number(
          new URL(String(input), "http://localhost").searchParams.get("offset"),
        );
        return new Response(
          JSON.stringify(
            profilePage(offset, offset === 40 ? 5 : 20, offset !== 40),
          ),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    );
    vi.stubGlobal("fetch", request);
    const { InfiniteQueryObserver } = await import(
      `${dependencies}/@tanstack/react-query/build/modern/index.js`
    );
    const observer = new InfiniteQueryObserver(client, query.options);
    await observer.fetchNextPage();
    expect(request).toHaveBeenCalledOnce();
    const requested = new URL(
      String(request.mock.calls[0][0]),
      "http://localhost",
    );
    expect(requested.pathname).toBe("/api/community");
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      view: "profile",
      handle: "builder",
      offset: "20",
    });
    expect(render()).toContain("Load more");
    await observer.fetchNextPage();
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      new URL(
        String(request.mock.calls[1][0]),
        "http://localhost",
      ).searchParams.get("offset"),
    ).toBe("40");
    const completeHtml = render();
    expect(completeHtml.match(/<article /g)).toHaveLength(45);
    expect(completeHtml).toContain('href="/projects/project-45"');
    expect(completeHtml).not.toContain("Load more");
    expect(completeHtml).toContain("No completed skill checks yet");
    expect(completeHtml).not.toContain("Create a project");
    observer.destroy();
    client.clear();
  });

  it("does not reuse another profile's paginated projects", async () => {
    surface.tab = "projects";
    const { ProfileView } = await import(`${components}/profile-view.tsx`);
    const builderKey = await communityKey({
      view: "profile",
      handle: "builder",
    });
    const otherKey = await communityKey({
      view: "profile",
      handle: "other-person",
    });
    const { render } = await connected(
      ProfileView,
      { handle: "other-person" },
      [
        [
          otherKey,
          {
            ...profilePage(0, 0, false),
            profile: { ...person, handle: "other-person" },
          },
        ],
        [
          [...otherKey, "pages"],
          { pages: [profilePage(0, 0, false)], pageParams: [0] },
        ],
        [[...builderKey, "pages"], { pages: [profilePage()], pageParams: [0] }],
      ],
    );
    const html = render();
    expect(html).toContain("No public projects yet");
    expect(html).not.toContain('href="/projects/project-1"');
    expect(html).not.toContain("Load more");
    expect(html).not.toContain("Create a project");
  });

  it("preserves the unclaimed owner's me query and owner-scoped skill result cache", async () => {
    surface.tab = "projects";
    const { ProfileView } = await import(`${components}/profile-view.tsx`);
    const key = await communityKey({ view: "profile", handle: "me" });
    const data = {
      ...profilePage(0, 0, false),
      profile: { ...person, handle: "", isMe: true },
    };
    const savedResult = {
      id: "saved-result",
      assessmentId: "javascript",
      title: "JavaScript foundations",
      skill: "JavaScript",
      score: 60,
      correct: 3,
      total: 5,
      remark: "Owner-scoped result",
      completedAt: "2026-10-14T10:00:00Z",
    };
    const { client, render } = await connected(ProfileView, { handle: "me" }, [
      [key, data],
      [[...key, "pages"], { pages: [data], pageParams: [0] }],
      [["assessment-results", "me", person.id], { results: [savedResult] }],
      [
        ["assessment-results", "me"],
        { results: [{ ...savedResult, remark: "Wrong unscoped cache" }] },
      ],
    ]);
    const html = render();
    expect(html).toContain("Create a project");
    expect(html).toContain("Owner-scoped result");
    expect(html).toContain("60%");
    expect(html).not.toContain("Wrong unscoped cache");
    expect(
      client.getQueryCache().find({ queryKey: [...key, "pages"], exact: true })
        ?.options.queryFn,
    ).toBeTypeOf("function");
  });

  it("shows loading rather than an empty collection while profile project pages are pending", async () => {
    surface.tab = "projects";
    const { ProfileView } = await import(`${components}/profile-view.tsx`);
    const key = await communityKey({ view: "profile", handle: "builder" });
    const { render } = await connected(ProfileView, { handle: "builder" }, [
      [key, profilePage()],
    ]);
    const html = render();
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("No public projects yet");
  });

  it("keeps the private-view sign-in gate when the project page request is denied", async () => {
    surface.tab = "projects";
    const { ProfileView } = await import(`${components}/profile-view.tsx`);
    const key = await communityKey({ view: "profile", handle: "builder" });
    const { client, render } = await connected(
      ProfileView,
      { handle: "builder" },
      [[key, profilePage()]],
    );
    render();
    const query = client
      .getQueryCache()
      .find({ queryKey: [...key, "pages"], exact: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { message: "Sign in required" } }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );
    await expect(query.fetch()).rejects.toMatchObject({ status: 401 });
    const html = render();
    expect(html).toContain("Sign in to see this");
    expect(html).not.toContain('href="/projects/project-1"');
    expect(html).not.toContain("No public projects yet");
    expect(html).not.toContain("Load more");
  });
});
