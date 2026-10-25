import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = `${process.cwd()}/artifacts/proofstack`;
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

// Exercise the server route itself without booting Next or its client providers.
// The JSX seam records element props; navigation is Next's throwing redirect API.
function route(path: string) {
  const code = ts.transpileModule(source(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports: Record<string, unknown> = {};
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": {
      jsx: (type: unknown, props: unknown) => ({ type, props }),
      jsxs: (type: unknown, props: unknown) => ({ type, props }),
    },
    "@/features/careers/workspace": { Applications: "Applications" },
    "@/features/opportunities/shell": {
      OpportunitiesShell: "OpportunitiesShell",
    },
    "@/features/community/ui": { PageHead: "PageHead" },
    "next/navigation": {
      redirect: (href: string) => {
        throw new Error(`REDIRECT:${href}`);
      },
    },
  };
  new Function("require", "exports", code)((name: string) => {
    if (!(name in dependencies))
      throw new Error(`Unexpected route dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports.default as (props: {
    searchParams: Promise<{ job?: string | string[] }>;
  }) => Promise<{
    type: string;
    props: {
      jobId?: string;
      children?: Array<{ type: string; props: { jobId?: string } }>;
    };
  }>;
}

describe("career navigation content ownership (N1)", () => {
  const job = "5b82d3a0-e706-4c74-96ed-12c48e0ab743";
  it("renders the hiring inbox only on the Hiring page; the career workspace is gone", () => {
    expect(source("features/careers/workspace.tsx")).not.toContain(
      "CareerWorkspace",
    );
    const hiring = source("features/opportunities/hiring.tsx");
    expect(hiring).toContain('<Applications initialScope="received" />');
    expect(source("features/opportunities/suggested.tsx")).not.toContain(
      "<Applications",
    );
  });
  it("passes the listing query into the applications page", async () => {
    const element = await route(
      "app/(community)/opportunities/applications/page.tsx",
    )({ searchParams: Promise.resolve({ job }) });
    expect(element.type).toBe("OpportunitiesShell");
    expect(
      (element.props.children as unknown as { props: { jobId?: string } }).props
        .jobId,
    ).toBe(job);
  });
  it.each([
    ["career", `/opportunities/applications?job=${encodeURIComponent(job)}`],
    [
      "career/applications",
      `/opportunities/applications?job=${encodeURIComponent(job)}`,
    ],
  ])("redirects the legacy %s inbox URL with its listing", async (page, to) => {
    await expect(
      route(`app/(community)/${page}/page.tsx`)({
        searchParams: Promise.resolve({ job }),
      }),
    ).rejects.toThrow(`REDIRECT:${to}`);
  });
  it.each(
    [undefined, "//external.test/path", "bad&job=other", [job, job]].map(
      (job) => ({ job }),
    ),
  )(
    "drops invalid or absent legacy job $job from the redirect",
    async ({ job }) => {
      await expect(
        route("app/(community)/career/page.tsx")({
          searchParams: Promise.resolve({ job }),
        }),
      ).rejects.toThrow("REDIRECT:/opportunities/hiring");
      await expect(
        route("app/(community)/career/applications/page.tsx")({
          searchParams: Promise.resolve({ job }),
        }),
      ).rejects.toThrow("REDIRECT:/opportunities/applications");
    },
  );
  it("sends listing review, applicant tracking and thread back links to the applications page", () => {
    const boards = source("features/careers/boards.tsx");
    const job = source("features/careers/job.tsx");
    const thread = source("features/careers/workspace.tsx").split(
      "export function ApplicationThread",
    )[1];
    expect(boards).toMatch(
      /href="\/opportunities\/applications"[^>]*>\s*Track progress/,
    );
    expect(job).toContain(
      "href={`/opportunities/applications?job=${encodeURIComponent(j.id)}`}",
    );
    expect(job).toMatch(
      /href="\/opportunities\/applications">\s*Track your application/,
    );
    expect(thread).toContain('href="/opportunities/applications"');
    for (const file of [boards, job, thread])
      expect(file).not.toContain("/career");
  });
});
