import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as web from "../artifacts/proofstack/proxy";
import {
  EXAM_DEVICE_CHECK_PATH,
  EXAM_PERMISSIONS_POLICY,
  EXAM_TAKE_PATH,
  isExamPath,
} from "../artifacts/proofstack/lib/chrome";

const root = `${process.cwd()}/artifacts/proofstack`;
const dependencies = `${root}/node_modules`;

// Loaded by path: these files use the web app's own types and "@/" imports,
// which the tests project does not share.
type HeaderEntry = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};
const { default: config } = (await import(`${root}/next.config.ts`)) as {
  default: { headers: () => Promise<HeaderEntry[]> };
};
const { default: robots } = (await import(`${root}/app/robots.ts`)) as {
  default: () => { rules: { disallow: string[] } };
};
const { default: sitemap } = (await import(`${root}/app/sitemap.ts`)) as {
  default: () => Array<{ url: string }>;
};

// Next's own builder for the pattern of a `headers()` entry: the expression
// it writes to the routes manifest, which both its server and the Workers
// adapter test each request path against.
const { buildCustomRoute } = createRequire(
  new URL("../artifacts/proofstack/package.json", import.meta.url),
)("next/dist/lib/build-custom-route.js") as {
  buildCustomRoute: (
    type: "header",
    route: { source: string; headers: unknown[] },
  ) => { regex: string };
};

// The headers a page response carries: every matching entry in order, a
// later entry replacing the same key of an earlier one.
async function responseHeaders(path: string) {
  const sent = new Map<string, string>();
  for (const entry of await config.headers()) {
    if (!new RegExp(buildCustomRoute("header", entry).regex).test(path))
      continue;
    for (const header of entry.headers) sent.set(header.key, header.value);
  }
  return sent;
}
const permissions = (value: string | undefined) =>
  Object.fromEntries(
    (value ?? "")
      .split(", ")
      .map((item) => item.split("=") as [string, string]),
  );

function pageRoutes(directory: string, segments: string[] = []): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return pageRoutes(
        `${directory}/${entry.name}`,
        entry.name.startsWith("(") ? segments : [...segments, entry.name],
      );
    return entry.name === "page.tsx" ? ["/" + segments.join("/")] : [];
  });
}

const ATTEMPT = "3f1c2a9e-8b7d-4c6f-9a1e-0b2d4f6a8c1e";
const EXAM_PAGES = [
  "/assessments/take/x",
  `/assessments/take/${ATTEMPT}`,
  "/assessments/device-check",
];

afterEach(() => vi.unstubAllEnvs());

describe("exam paths", () => {
  it.each([
    ...EXAM_PAGES,
    "/assessments/take",
    `/assessments/take/${ATTEMPT}/anything`,
  ])("recognises %s", (path) => expect(isExamPath(path)).toBe(true));

  it.each([
    "/",
    "/home",
    "/assessments",
    "/assessments/taken",
    "/assessments/take-home",
    "/assessments/device-checks",
    "/assessments/device-check/extra",
    "/assessments/results",
    `/assessments/results/${ATTEMPT}`,
    "/assessments/series/take",
    "/x/assessments/take/y",
    "/Assessments/Take/x",
    "",
    null,
    undefined,
  ])("leaves %s alone", (path) => expect(isExamPath(path)).toBe(false));

  it("names the two exam addresses once", () => {
    expect(EXAM_TAKE_PATH).toBe("/assessments/take");
    expect(EXAM_DEVICE_CHECK_PATH).toBe("/assessments/device-check");
  });
});

describe("Permissions-Policy by path (built configuration)", () => {
  it("lets the exam pages use the camera and microphone, for this site only", async () => {
    for (const path of EXAM_PAGES) {
      const sent = await responseHeaders(path);
      expect(sent.get("Permissions-Policy"), path).toBe(
        EXAM_PERMISSIONS_POLICY,
      );
      expect(permissions(sent.get("Permissions-Policy")), path).toEqual({
        camera: "(self)",
        microphone: "(self)",
        fullscreen: "(self)",
        geolocation: "()",
        payment: "()",
        "display-capture": "()",
      });
    }
  });

  it("keeps the other security headers on the exam pages", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const path of [...EXAM_PAGES, "/home"]) {
      const sent = await responseHeaders(path);
      expect(sent.get("X-Content-Type-Options"), path).toBe("nosniff");
      expect(sent.get("Referrer-Policy"), path).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(sent.get("Strict-Transport-Security"), path).toBe(
        "max-age=31536000",
      );
      expect(sent.get("X-Frame-Options"), path).toBe("SAMEORIGIN");
    }
    // Outside production the base entry sends the first two only, as before.
    vi.stubEnv("NODE_ENV", "development");
    const development = await responseHeaders("/assessments/take/x");
    expect(development.get("X-Content-Type-Options")).toBe("nosniff");
    expect(development.get("Permissions-Policy")).toBe(EXAM_PERMISSIONS_POLICY);
    expect(development.has("Strict-Transport-Security")).toBe(false);
  });

  it("keeps the camera and microphone off everywhere else", async () => {
    for (const path of [
      "/",
      "/home",
      "/assessments",
      "/assessments/taken",
      "/assessments/device-checks",
      "/assessments/device-check/extra",
      `/assessments/results/${ATTEMPT}`,
      "/assessments/series/take",
      "/shorts",
      "/verify/ABCD-1234",
      "/api/skills/attempts/x/action",
    ])
      expect(
        (await responseHeaders(path)).get("Permissions-Policy"),
        path,
      ).toBe("camera=(), microphone=(), geolocation=(), payment=()");
  });

  it("allows the devices on the two exam pages of the app and on no other page", async () => {
    const routes = pageRoutes(`${root}/app`);
    expect(routes.length).toBeGreaterThan(80);
    const allowed: string[] = [];
    for (const route of routes) {
      const path = route.replace(/\[[^\]]+\]/g, "someone");
      const policy = permissions(
        (await responseHeaders(path)).get("Permissions-Policy"),
      );
      expect(isExamPath(path), route).toBe(policy.camera !== "()");
      expect(policy.camera === "()", route).toBe(policy.microphone === "()");
      if (policy.camera !== "()") {
        allowed.push(route);
        expect(policy.camera, route).toBe("(self)");
        expect(policy.microphone, route).toBe("(self)");
      }
    }
    expect(allowed).toEqual(
      expect.arrayContaining([
        "/assessments/device-check",
        "/assessments/take/[attemptId]",
      ]),
    );
    for (const route of allowed)
      expect(route).toMatch(/^\/assessments\/(?:take\/|device-check$)/);
  });

  it("sets the header in one place, with one spelling", async () => {
    const entries = await config.headers();
    expect(entries.map((entry) => entry.source)).toEqual([
      "/:path*",
      "/assessments/take/:path*",
      "/assessments/device-check",
    ]);
    // The Workers adapter merges entries by exact key.
    for (const entry of entries.slice(1))
      expect(entry.headers).toEqual([
        { key: "Permissions-Policy", value: EXAM_PERMISSIONS_POLICY },
      ]);
    // Neither the proxy nor the static header file sends a second copy: the
    // Workers adapter would let the configuration win over the proxy anyway.
    type WebRequest = Parameters<typeof web.proxy>[0];
    const { NextRequest } = (await import(
      `${dependencies}/next/server.js`
    )) as { NextRequest: new (url: string) => WebRequest };
    for (const path of ["/assessments/take/x", "/assessments/device-check"]) {
      const response = web.proxy(new NextRequest(`https://app.test${path}`));
      expect(response.headers.get("Permissions-Policy")).toBeNull();
      expect(response.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'self'",
      );
    }
    expect(readFileSync(`${root}/public/_headers`, "utf8")).not.toContain(
      "Permissions-Policy",
    );
  });
});

const ui = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/hooks/use-auth", () => ({
  useSession: () => ({
    data: { authenticated: ui.signedIn, user: { displayName: "Viewer" } },
  }),
  useAct: () => ({ act: vi.fn() }),
}));
vi.mock("@/hooks/use-viewer", () => ({
  useViewer: () => ({ viewer: null, unread: 3 }),
}));

async function renderAt(path: string, file: string, name: string) {
  const { createElement } = await import(`${dependencies}/react/index.js`);
  const { renderToStaticMarkup } = await import(
    `${dependencies}/react-dom/server.node.js`
  );
  const { AppRouterContext } = await import(
    `${dependencies}/next/dist/shared/lib/app-router-context.shared-runtime.js`
  );
  const { PathnameContext } = await import(
    `${dependencies}/next/dist/shared/lib/hooks-client-context.shared-runtime.js`
  );
  const component = (await import(`${root}/components/${file}.tsx`))[name];
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: { push: vi.fn() } },
      createElement(
        PathnameContext.Provider,
        { value: path },
        createElement(component),
      ),
    ),
  ) as string;
}

describe("page chrome on exam paths (static render)", () => {
  afterEach(() => {
    ui.signedIn = false;
  });
  const CHROME = [
    ["site-header", "SiteHeader"],
    ["site-footer", "SiteFooter"],
    ["bottom-tabs", "BottomTabs"],
  ] as const;

  it.each(CHROME)("%s renders nothing on an exam page", async (file, name) => {
    for (const signedIn of [false, true]) {
      ui.signedIn = signedIn;
      for (const path of [...EXAM_PAGES, "/assessments/take"])
        expect(await renderAt(path, file, name), path).toBe("");
    }
  });

  it("still renders the header, footer and tabs everywhere else", async () => {
    for (const path of ["/home", "/assessments", "/assessments/results"]) {
      ui.signedIn = false;
      expect(await renderAt(path, "site-header", "SiteHeader")).toContain(
        "Log in",
      );
      const footer = await renderAt(path, "site-footer", "SiteFooter");
      expect(footer).toContain("<footer");
      expect(footer).toContain("Grievance Officer");
      expect(footer).toContain('href="/privacy"');
      // Signed-out visitors never had bottom tabs.
      expect(await renderAt(path, "bottom-tabs", "BottomTabs")).toBe("");
      ui.signedIn = true;
      const header = await renderAt(path, "site-header", "SiteHeader");
      expect(header).toContain('aria-label="Primary"');
      expect(header).toContain("Notifications, 3 unread");
      const tabs = await renderAt(path, "bottom-tabs", "BottomTabs");
      expect(tabs).toContain('aria-label="Quick navigation"');
      expect(tabs).toContain('href="/profile/me"');
    }
  });
});

describe("placeholder pages", () => {
  // Section 13.1 of the specification: every new address has a page file.
  it.each([
    "(community)/assessments/series/[slug]",
    "(community)/assessments/assigned",
    "(community)/assessments/join/[token]",
    "(community)/assessments/results/[attemptId]",
    "(community)/assessments/methodology",
    "(community)/assessments/studio",
    "(community)/assessments/review",
    "(exam)/assessments/device-check",
    "(exam)/assessments/take/[attemptId]",
    "verify/[code]",
    "(community)/organizations/[slug]/cohorts",
    "(community)/organizations/[slug]/cohorts/[id]",
    "(community)/organizations/[slug]/assignments",
    "(community)/organizations/[slug]/assignments/[id]",
    "(community)/organizations/[slug]/sittings/[id]",
    "(community)/organizations/[slug]/skill-checks",
    "(community)/organizations/[slug]/results",
    "shorts",
    "shorts/[id]",
    "(community)/topics/[slug]",
    "account/admin/access",
    "account/admin/organizations",
    "account/admin/entitlements",
    "account/admin/moderation",
  ])("has app/%s/page.tsx", (folder) => {
    expect(existsSync(`${root}/app/${folder}/page.tsx`)).toBe(true);
  });

  it("keeps the exam pages in their own group, apart from the community layout", () => {
    expect(existsSync(`${root}/app/(exam)/layout.tsx`)).toBe(true);
    for (const folder of ["take", "device-check"])
      expect(existsSync(`${root}/app/(community)/assessments/${folder}`)).toBe(
        false,
      );
    const layout = readFileSync(`${root}/app/(exam)/layout.tsx`, "utf8");
    expect(layout).toContain("index: false");
    expect(layout).not.toMatch(/SiteHeader|SiteFooter|BottomTabs/);
  });

  it("adds only verify, shorts and topics as top-level page addresses", () => {
    // First segments that lead to a page (a member's handle is not one).
    const top = pageRoutes(`${root}/app`)
      .map((route) => route.split("/")[1]!)
      .filter((segment) => segment && !segment.startsWith("["));
    const known = [
      "about",
      "account",
      "applications",
      "assessments",
      "auth",
      "bookmarks",
      "career",
      "code",
      "community",
      "community-guidelines",
      "contact",
      "design-system",
      "editor",
      "foundation",
      "home",
      "intelligence",
      "notifications",
      "opportunities",
      "organizations",
      "posts",
      "privacy",
      "profile",
      "projects",
      "pulls",
      "repositories",
      "search",
      "settings",
      "talent",
      "terms",
      "welcome",
      "work",
    ];
    expect(
      [...new Set(top)].filter((name) => !known.includes(name)).sort(),
    ).toEqual(["shorts", "topics", "verify"]);
  });
});

describe("search engines", () => {
  it("keeps credential checks, attempts and private skill pages out of search", () => {
    const { disallow } = robots().rules;
    expect(disallow).toEqual(
      expect.arrayContaining([
        // Unchanged.
        "/api/",
        "/account",
        "/settings",
        "/welcome",
        "/auth",
        "/editor",
        "/code",
        "/notifications",
        // New.
        "/verify",
        "/assessments/take",
        "/assessments/device-check",
        "/assessments/assigned",
        "/assessments/join",
        "/assessments/results/",
        "/assessments/studio",
        "/assessments/review",
      ]),
    );
    // The catalogue and the public results list stay open to search.
    expect(disallow).not.toContain("/assessments");
    expect(disallow).not.toContain("/assessments/results");
    expect(readFileSync(`${root}/app/verify/layout.tsx`, "utf8")).toContain(
      "index: false",
    );
  });

  it("lists exactly today's pages while hosted video is off, and Shorts once it is on", () => {
    vi.stubEnv("VIDEO_ORIGIN", "");
    const paths = () =>
      sitemap().map((entry) => new URL(entry.url).pathname.replace(/\/$/, ""));
    expect(paths()).toEqual([
      "",
      "/projects",
      "/opportunities",
      "/talent",
      "/assessments",
      "/organizations",
      "/about",
      "/terms",
      "/privacy",
      "/community-guidelines",
      "/contact",
    ]);
    vi.stubEnv("VIDEO_ORIGIN", "https://customer-abc123.video.example");
    expect(paths()).toEqual(
      expect.arrayContaining(["/shorts", "/assessments"]),
    );
    expect(paths()).toHaveLength(12);
    for (const path of paths()) {
      expect(path).not.toMatch(/^\/(verify|topics)/);
      expect(isExamPath(path)).toBe(false);
    }
  });
});
