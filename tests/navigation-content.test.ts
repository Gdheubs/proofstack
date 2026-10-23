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
    "@/features/careers/workspace": {
      CareerWorkspace: "CareerWorkspace",
      Applications: "Applications",
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
  it("renders the complete inbox only on its dedicated page, never in preferences", () => {
    const workspace = source("features/careers/workspace.tsx");
    const preferences = workspace
      .split("export function CareerWorkspace")[1]
      .split("const transitions")[0];
    expect(preferences).not.toContain("<Applications");
    expect(preferences).toContain('href="/career/applications"');
  });
  it("passes the listing query into the dedicated application inbox", async () => {
    const element = await route("app/(community)/career/applications/page.tsx")(
      { searchParams: Promise.resolve({ job }) },
    );
    expect(
      element.props.children?.find((child) => child.type === "Applications")
        ?.props.jobId,
    ).toBe(job);
  });
  it("redirects a legacy listing inbox URL to its new single home", async () => {
    await expect(
      route("app/(community)/career/page.tsx")({
        searchParams: Promise.resolve({ job }),
      }),
    ).rejects.toThrow(
      `REDIRECT:/career/applications?job=${encodeURIComponent(job)}`,
    );
  });
  it.each(
    [undefined, "//external.test/path", "bad&job=other", [job, job]].map(
      (job) => ({ job }),
    ),
  )(
    "keeps invalid or absent legacy job $job on preferences",
    async ({ job }) => {
      const element = await route("app/(community)/career/page.tsx")({
        searchParams: Promise.resolve({ job }),
      });
      expect(element.type).toBe("CareerWorkspace");
      expect(element.props.jobId).toBeUndefined();
    },
  );
  it("sends listing review, applicant tracking and thread back links to the dedicated inbox", () => {
    const boards = source("features/careers/boards.tsx");
    const job = source("features/careers/job.tsx");
    const thread = source("features/careers/workspace.tsx").split(
      "export function ApplicationThread",
    )[1];
    expect(boards).toMatch(
      /href="\/career\/applications"[^>]*>\s*Track progress/,
    );
    expect(job).toContain(
      "href={`/career/applications?job=${encodeURIComponent(j.id)}`}",
    );
    expect(job).toMatch(
      /href="\/career\/applications">\s*Track your application/,
    );
    expect(thread).toContain('href="/career/applications"');
    expect(job).not.toContain("/career?job=");
  });
});

it("takes the overview collaboration card to organizations, with work-board guidance (N11)", () => {
  const home = source("app/page.tsx");
  const card = home.match(
    /title: "Make progress together"[\s\S]*?cta: [^\n]+/,
  )?.[0];
  expect(card).toBeDefined();
  // Each home-page call to action leads somewhere different.
  expect(card).toContain('href: "/organizations"');
  expect(card).toMatch(/work board/i);
  expect(card).not.toContain("Join the build log");
});
