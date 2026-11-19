import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContentSecurityPolicy } from "../artifacts/proofstack/lib/security";
import {
  mediaCspSources,
  withMediaCsp,
} from "../artifacts/proofstack/lib/security-media";

const MEDIA = "https://media.proofstack.example";
const VIDEO = "https://customer-abc123.video.example";
const UPLOAD = "https://upload.video.example";

// The policy as it is today, in production and in development. With no
// media origin configured it must stay byte for byte the same.
const PRODUCTION_POLICY =
  "default-src 'self'; script-src 'self' 'nonce-testNonce123' 'strict-dynamic' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests";
const DEVELOPMENT_POLICY =
  "default-src 'self'; script-src 'self' 'nonce-testNonce123' 'strict-dynamic' https://challenges.cloudflare.com 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws: wss:; frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

afterEach(() => vi.unstubAllEnvs());

describe("media sources for the content security policy", () => {
  it("returns nothing when no origin is configured", () => {
    expect(mediaCspSources({})).toEqual({});
    expect(
      mediaCspSources({
        MEDIA_ORIGIN: "",
        VIDEO_ORIGIN: undefined,
        VIDEO_UPLOAD_ORIGIN: "",
      }),
    ).toEqual({});
    for (const name of ["MEDIA_ORIGIN", "VIDEO_ORIGIN", "VIDEO_UPLOAD_ORIGIN"])
      vi.stubEnv(name, undefined);
    expect(mediaCspSources()).toEqual({});
  });

  it("returns the four directives of section 13.4 when every origin is set", () => {
    expect(
      mediaCspSources({
        MEDIA_ORIGIN: MEDIA,
        VIDEO_ORIGIN: VIDEO,
        VIDEO_UPLOAD_ORIGIN: UPLOAD,
      }),
    ).toEqual({
      "media-src": `'self' blob: ${MEDIA} ${VIDEO}`,
      "connect-src": `${MEDIA} ${VIDEO} ${UPLOAD}`,
      "img-src": VIDEO,
      "worker-src": "'self' blob:",
    });
  });

  it("reads the environment by default", () => {
    vi.stubEnv("MEDIA_ORIGIN", MEDIA);
    vi.stubEnv("VIDEO_ORIGIN", "");
    vi.stubEnv("VIDEO_UPLOAD_ORIGIN", "");
    expect(mediaCspSources()).toEqual({
      "media-src": `'self' blob: ${MEDIA}`,
      "connect-src": MEDIA,
    });
  });

  it("adds only what each configured origin needs", () => {
    // Recorded answers without hosted video: no poster or player worker.
    expect(mediaCspSources({ MEDIA_ORIGIN: MEDIA })).toEqual({
      "media-src": `'self' blob: ${MEDIA}`,
      "connect-src": MEDIA,
    });
    // Hosted video without recorded answers.
    expect(
      mediaCspSources({ VIDEO_ORIGIN: VIDEO, VIDEO_UPLOAD_ORIGIN: UPLOAD }),
    ).toEqual({
      "media-src": `'self' blob: ${VIDEO}`,
      "connect-src": `${VIDEO} ${UPLOAD}`,
      "img-src": VIDEO,
      "worker-src": "'self' blob:",
    });
    // An upload address alone can only be connected to.
    expect(mediaCspSources({ VIDEO_UPLOAD_ORIGIN: UPLOAD })).toEqual({
      "connect-src": UPLOAD,
    });
    // One origin serving two purposes is listed once.
    expect(
      mediaCspSources({
        MEDIA_ORIGIN: MEDIA,
        VIDEO_ORIGIN: MEDIA,
        VIDEO_UPLOAD_ORIGIN: MEDIA,
      }),
    ).toMatchObject({
      "media-src": `'self' blob: ${MEDIA}`,
      "connect-src": MEDIA,
    });
  });

  it.each([
    "media.proofstack.example",
    "http://media.proofstack.example",
    "https://media.proofstack.example/",
    "https://media.proofstack.example/files",
    "https://media.proofstack.example?x=1",
    "https://*.proofstack.example",
    "https://*",
    "https://media.proofstack.example;sandbox",
    "https://media.proofstack.example,evil.example",
    "https://media.proofstack.example'",
    "https://localhost",
    "https://203.0.113.7",
    "https://user:password@media.proofstack.example",
    "HTTPS://MEDIA.PROOFSTACK.EXAMPLE",
    "https://media.proofstack.example https://evil.example",
    "https://media.proofstack.example; script-src *",
    " https://media.proofstack.example",
    "*",
    "'self'",
    "data:",
    "blob:",
    "//media.proofstack.example",
  ])("throws for a malformed origin (%s)", (value) => {
    for (const name of [
      "MEDIA_ORIGIN",
      "VIDEO_ORIGIN",
      "VIDEO_UPLOAD_ORIGIN",
    ] as const)
      expect(() => mediaCspSources({ [name]: value })).toThrow(
        `${name} must be an exact HTTPS origin`,
      );
  });

  it("accepts an exact HTTPS origin with a port", () => {
    expect(
      mediaCspSources({ VIDEO_UPLOAD_ORIGIN: "https://upload.example:8443" }),
    ).toEqual({ "connect-src": "https://upload.example:8443" });
  });
});

describe("content security policy with media sources", () => {
  const directives = PRODUCTION_POLICY.split("; ");

  it("leaves the policy unchanged when nothing is configured", () => {
    expect(withMediaCsp(directives, {})).toEqual(directives);
    for (const name of ["MEDIA_ORIGIN", "VIDEO_ORIGIN", "VIDEO_UPLOAD_ORIGIN"])
      vi.stubEnv(name, "");
    expect(withMediaCsp(directives).join("; ")).toBe(PRODUCTION_POLICY);
  });

  it("extends connect-src and img-src and adds media-src and worker-src", () => {
    const policy = withMediaCsp(
      directives,
      mediaCspSources({
        MEDIA_ORIGIN: MEDIA,
        VIDEO_ORIGIN: VIDEO,
        VIDEO_UPLOAD_ORIGIN: UPLOAD,
      }),
    );
    expect(policy).toEqual([
      "default-src 'self'",
      "script-src 'self' 'nonce-testNonce123' 'strict-dynamic' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${VIDEO}`,
      "font-src 'self'",
      `connect-src 'self' ${MEDIA} ${VIDEO} ${UPLOAD}`,
      "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
      `media-src 'self' blob: ${MEDIA} ${VIDEO}`,
      "worker-src 'self' blob:",
    ]);
    // Scripts and frames gain nothing, and each directive appears once.
    const names = policy.map((directive) => directive.split(" ")[0]);
    expect(new Set(names).size).toBe(names.length);
    expect(directives).toEqual(PRODUCTION_POLICY.split("; "));
  });

  it("keeps the development sources in front of the media ones", () => {
    expect(
      withMediaCsp(
        DEVELOPMENT_POLICY.split("; "),
        mediaCspSources({ MEDIA_ORIGIN: MEDIA }),
      ),
    ).toContain(`connect-src 'self' ws: wss: ${MEDIA}`);
  });

  it("never emits connect-src or img-src without the policy's own sources", () => {
    expect(() =>
      withMediaCsp(["default-src 'self'"], { "connect-src": MEDIA }),
    ).toThrow("Content security policy has no connect-src directive");
    expect(() =>
      withMediaCsp(["default-src 'self'", "connect-src 'self'"], {
        "img-src": VIDEO,
      }),
    ).toThrow("Content security policy has no img-src directive");
  });
});

describe("the site's content security policy", () => {
  it("is byte for byte today's policy while no media origin is configured", () => {
    for (const name of ["MEDIA_ORIGIN", "VIDEO_ORIGIN", "VIDEO_UPLOAD_ORIGIN"])
      vi.stubEnv(name, "");
    expect(buildContentSecurityPolicy("testNonce123", false)).toBe(
      PRODUCTION_POLICY,
    );
    expect(buildContentSecurityPolicy("testNonce123", true)).toBe(
      DEVELOPMENT_POLICY,
    );
  });

  // lib/security.ts is a shared file: the integrator adds the call to
  // withMediaCsp. These checks start running as soon as it is there.
  const integrated = readFileSync(
    `${process.cwd()}/artifacts/proofstack/lib/security.ts`,
    "utf8",
  ).includes("withMediaCsp");

  it.skipIf(!integrated)(
    "carries the media sources once origins are configured",
    () => {
      vi.stubEnv("MEDIA_ORIGIN", MEDIA);
      vi.stubEnv("VIDEO_ORIGIN", VIDEO);
      vi.stubEnv("VIDEO_UPLOAD_ORIGIN", UPLOAD);
      const policy = buildContentSecurityPolicy("testNonce123", false);
      expect(policy.split("; ")).toEqual(
        withMediaCsp(PRODUCTION_POLICY.split("; ")),
      );
      expect(policy).toContain(`media-src 'self' blob: ${MEDIA} ${VIDEO}`);
      expect(policy).toContain(
        "script-src 'self' 'nonce-testNonce123' 'strict-dynamic' https://challenges.cloudflare.com;",
      );
    },
  );

  it.skipIf(!integrated)("fails loudly on a malformed origin", () => {
    vi.stubEnv("MEDIA_ORIGIN", "https://media.proofstack.example/");
    expect(() => buildContentSecurityPolicy("testNonce123", false)).toThrow(
      "MEDIA_ORIGIN must be an exact HTTPS origin",
    );
  });
});
