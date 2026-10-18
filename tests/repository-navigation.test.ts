import { beforeAll, describe, expect, it, vi } from "vitest";

const frontend = `${process.cwd()}/artifacts/proofstack`;
const dependencies = `${frontend}/node_modules`;
const repositoryId = "repository-one";
// Resolve the frontend's split @ aliases to real modules without replacing
// components or hooks. The root test runner does not load Next's tsconfig.
beforeAll(async () => {
  for (const name of [
    "features/community/ui",
    "features/careers/shared",
    "features/auth/shared",
    "features/auth/mfa",
    "features/repositories/action-form",
    "hooks/use-community",
    "hooks/use-auth",
    "hooks/use-repository",
    "hooks/use-pulls",
    "hooks/use-intelligence",
    "lib/community",
  ]) {
    const extension = name.startsWith("hooks/") || name.startsWith("lib/")
      ? "ts"
      : "tsx";
    vi.doMock(`@/${name}`, () => import(`${frontend}/${name}.${extension}`));
  }
  for (const name of [
    "components/ui/button",
    "components/ui/input",
    "components/ui/avatar",
    "components/ui/dialog",
    "components/ui/alert-dialog",
    "lib/utils",
  ]) {
    const extension = name.startsWith("components/") ? "tsx" : "ts";
    const sourceRoot = name.startsWith("components/") ? `${frontend}/src` : frontend;
    vi.doMock(
      `@/${name}`,
      () => import(`${sourceRoot}/${name}.${extension}`),
    );
  }
  Object.assign(globalThis, {
    React: await import(`${dependencies}/react/index.js`),
  });
});
const repository = (canManage: boolean) => ({
  id: repositoryId,
  title: "Repository one",
  projectTitle: "Project one",
  projectSlug: "project-one",
  projectId: "project-one",
  defaultBranch: "main",
  canManage,
  canWrite: false,
  quotaBytes: 1048576,
});
const sourceData = (canManage: boolean) => ({
  repositories: [repository(canManage)],
  branches: [],
  branch: "main",
  head: "a".repeat(40),
  folder: "",
  entries: [],
  commits: [],
  tokens: [],
  usedBytes: 0,
  hasMore: false,
});

async function renderPage(
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
  client.setQueryData(["/api/auth/context"], {
    authenticated: true,
    mfaRequired: false,
    user: { id: "viewer" },
    factors: [],
  });
  for (const [key, data] of seeds) client.setQueryData(key, data);
  try {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          AppRouterContext.Provider,
          { value: { push: () => {} } },
          createElement(component, props),
        ),
      ),
    );
  } finally {
    client.clear();
  }
}

function expectRepositoryMenu(
  html: string,
  active: "source" | "pulls" | "releases" | "security",
  canManage: boolean,
) {
  const menus = [
    ...html.matchAll(
      /<nav\b[^>]*aria-label="Repository"[^>]*>([\s\S]*?)<\/nav>/g,
    ),
  ];
  expect(menus).toHaveLength(1);
  const links = [...menus[0][1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(
    ([, attributes, text]) => ({
      href: /href="([^"]*)"/.exec(attributes)?.[1],
      current: /aria-current="([^"]*)"/.exec(attributes)?.[1],
      text,
    }),
  );
  const entries = [
    ["source", "", "Source"],
    ["pulls", "/pulls", "Pull requests"],
    ["releases", "/releases", "Releases"],
    ...(canManage ? [["security", "/security", "Security review"]] : []),
  ];
  expect(links).toEqual(
    entries.map(([kind, suffix, text]) => ({
      href: `/repositories/${repositoryId}${suffix}`,
      current: active === kind ? "page" : undefined,
      text,
    })),
  );
  expect(
    html.match(/href="\/repositories\/repository-one\/security"/g) ?? [],
  ).toHaveLength(canManage ? 1 : 0);
  for (const suffix of ["/pulls", "/releases"])
    expect(
      html.match(
        new RegExp(`href="/repositories/${repositoryId}${suffix}"`, "g"),
      ),
    ).toHaveLength(1);
}

describe("repository-scoped navigation (N7)", () => {
  it.each([false, true])(
    "keeps the same siblings on Releases (manager=%s)",
    async (canManage) => {
      const { Releases } = await import(
        `${frontend}/features/pulls/releases.tsx`
      );
      const { getGetPullsQueryKey } = await import(
        `${process.cwd()}/lib/api-client-react/src/generated/api.ts`
      );
      const html = await renderPage(Releases, { repositoryId }, [
        [
          getGetPullsQueryKey({ repositoryId, view: "releases", offset: 0 }),
          {
            repository: repository(canManage),
            branches: [],
            releases: [],
            hasMore: false,
          },
        ],
      ]);
      expectRepositoryMenu(html, "releases", canManage);
    },
  );
  it.each([false, true])(
    "keeps the same siblings on Security review (manager=%s)",
    async (canManage) => {
      const { SecurityScanRequest } = await import(
        `${frontend}/features/intelligence/request-forms.tsx`
      );
      const { getGetRepositoriesQueryKey, getGetIntelligenceQueryKey } =
        await import(
          `${process.cwd()}/lib/api-client-react/src/generated/api.ts`
        );
      const html = await renderPage(SecurityScanRequest, { repositoryId }, [
        [
          getGetRepositoriesQueryKey({ id: repositoryId }),
          sourceData(canManage),
        ],
        [
          [...getGetIntelligenceQueryKey({ offset: 0 }), "viewer"],
          { enabled: false, jobs: [], usage: {} },
        ],
      ]);
      expectRepositoryMenu(html, "security", canManage);
      expect(html).toContain('href="/intelligence"');
    },
  );
  it.each([false, true])(
    "keeps the same siblings on Pull requests (manager=%s)",
    async (canManage) => {
      const { PullList } = await import(
        `${frontend}/features/pulls/pull-list.tsx`
      );
      const { getGetPullsQueryKey } = await import(
        `${process.cwd()}/lib/api-client-react/src/generated/api.ts`
      );
      const html = await renderPage(PullList, { repositoryId }, [
        [
          getGetPullsQueryKey({ repositoryId, status: "all", offset: 0 }),
          {
            repository: repository(canManage),
            branches: [],
            pulls: [],
            issues: [],
            hasMore: false,
          },
        ],
      ]);
      expectRepositoryMenu(html, "pulls", canManage);
    },
  );
  it.each([false, true])(
    "renders only repository siblings on Source (manager=%s)",
    async (canManage) => {
      const { RepositoryView } = await import(
        `${frontend}/features/repositories/repository-view.tsx`
      );
      const { getGetRepositoriesQueryKey } = await import(
        `${process.cwd()}/lib/api-client-react/src/generated/api.ts`
      );
      const html = await renderPage(RepositoryView, { id: repositoryId }, [
        [
          getGetRepositoriesQueryKey({ id: repositoryId, offset: 0, path: "" }),
          sourceData(canManage),
        ],
      ]);
      expectRepositoryMenu(html, "source", canManage);
      expect(html).toContain('href="/projects/project-one"');
      expect(html).toContain('href="/repositories"');
    },
  );
});
