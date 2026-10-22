import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as web from "../artifacts/proofstack/proxy";
import { TERMS_VERSION as SERVER_VERSION } from "../artifacts/api-server/src/services/legal";
import {
  MINIMUM_AGE,
  TERMS_VERSION,
  ageOn,
} from "../artifacts/proofstack/lib/legal";
import {
  MINIMUM_AGE as SERVER_MINIMUM_AGE,
  ageOn as serverAgeOn,
} from "../artifacts/api-server/src/services/legal";

type WebRequest = Parameters<typeof web.proxy>[0];
const { NextRequest } = (await import(
  `${process.cwd()}/artifacts/proofstack/node_modules/next/server.js`
)) as { NextRequest: new (url: string, init?: RequestInit) => WebRequest };
const rewriteOf = (path: string) =>
  web
    .proxy(new NextRequest(`https://app.test${path}`))
    .headers.get("x-middleware-rewrite");
const app = `${process.cwd()}/artifacts/proofstack/app`;

afterEach(() => vi.unstubAllEnvs());

describe("legal pages and internal tools", () => {
  it("answers 404 for internal tools in production only, keeping the CSP", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const path of ["/design-system", "/foundation", "/foundation/x"])
      expect(rewriteOf(path)).toContain("/_internal-page-hidden");
    expect(rewriteOf("/privacy")).toBeNull();
    expect(
      web
        .proxy(new NextRequest("https://app.test/design-system"))
        .headers.get("Content-Security-Policy"),
    ).toContain("default-src");
    vi.stubEnv("NODE_ENV", "development");
    expect(rewriteOf("/design-system")).toBeNull();
  });

  it("keeps the browser and server age rules and terms version in step", () => {
    expect(TERMS_VERSION).toBe(SERVER_VERSION);
    expect(MINIMUM_AGE).toBe(SERVER_MINIMUM_AGE);
    for (const date of ["2008-10-22", "2008-10-23", "1990-02-28"])
      expect(ageOn(date)).toBe(serverAgeOn(date));
  });

  it("publishes every page the IT Rules and DPDP Act require, linked from the footer", () => {
    for (const page of [
      "privacy",
      "terms",
      "about",
      "contact",
      "community-guidelines",
    ])
      expect(() => readFileSync(`${app}/${page}/page.tsx`)).not.toThrow();
    const terms = readFileSync(`${app}/terms/page.tsx`, "utf8");
    // Rule 3(1)(b) content list and the published grievance process.
    for (const phrase of [
      "paedophilic",
      "impersonates another person",
      "software virus",
      "36 hours",
      "Grievance Appellate Committee",
    ])
      expect(terms).toContain(phrase);
    const privacy = readFileSync(`${app}/privacy/page.tsx`, "utf8");
    for (const phrase of [
      "Data Protection Board",
      "180 days",
      "__Host-ps-session",
      "Download my data",
    ])
      expect(privacy).toContain(phrase);
    const footer = readFileSync(
      `${process.cwd()}/artifacts/proofstack/components/site-footer.tsx`,
      "utf8",
    );
    expect(footer).toContain("LEGAL_LINKS");
    expect(footer).toContain("grievanceOfficer");
  });
});
