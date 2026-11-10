import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  VIDEO_FRAME_ORIGINS,
  findVideoLink,
} from "../artifacts/proofstack/features/community/video-link";
import { buildContentSecurityPolicy } from "../artifacts/proofstack/lib/security";

describe("video links in posts", () => {
  it("plays YouTube from its privacy-enhanced domain, keeping the start time", () => {
    for (const text of [
      "Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90 now",
      "https://youtu.be/dQw4w9WgXcQ?t=1m30s",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&start=90",
    ])
      expect(findVideoLink(text)).toMatchObject({
        provider: "youtube",
        id: "dQw4w9WgXcQ",
        vertical: false,
        embedUrl:
          "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=90",
      });
    expect(
      findVideoLink("https://youtube.com/shorts/abcdefghijk"),
    ).toMatchObject({
      vertical: true,
      embedUrl:
        "https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0",
    });
  });

  it("reads Vimeo (including unlisted) and Loom links", () => {
    expect(findVideoLink("https://vimeo.com/76979871")?.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?autoplay=1&dnt=1",
    );
    expect(
      findVideoLink("https://vimeo.com/76979871/abc123def0")?.embedUrl,
    ).toBe(
      "https://player.vimeo.com/video/76979871?autoplay=1&dnt=1&h=abc123def0",
    );
    const loom = "https://www.loom.com/share/0123456789abcdef0123456789abcdef";
    expect(findVideoLink(`Demo: ${loom}.`)?.embedUrl).toBe(
      "https://www.loom.com/embed/0123456789abcdef0123456789abcdef?autoplay=1",
    );
  });

  it("uses the first supported link and ignores everything else", () => {
    expect(
      findVideoLink(
        "see https://example.com then https://youtu.be/dQw4w9WgXcQ",
      ),
    )?.toMatchObject({ provider: "youtube" });
    // Markup glued to a link never reaches the player address.
    expect(
      findVideoLink(
        'https://youtube.com/watch?v=dQw4w9WgXcQ"><script>x</script>',
      )?.embedUrl,
    ).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0",
    );
    expect(
      findVideoLink("https://evil.example/?u=https%3A//youtu.be/dQw4w9WgXcQ"),
    ).toBeNull();
    for (const text of [
      "no links here",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=short",
      "javascript:alert(1)//youtu.be/dQw4w9WgXcQ",
      "https://vimeo.com/channels/staffpicks",
      "https://www.loom.com/share/not-a-real-id",
    ])
      expect(findVideoLink(text)).toBeNull();
  });

  it("lets the site load exactly these players and keeps them sandboxed", () => {
    const policy = buildContentSecurityPolicy("testNonce123", false);
    const frames = /frame-src ([^;]+)/.exec(policy)![1]!.split(" ");
    // Plus the Turnstile challenge frame (see features/auth/turnstile.tsx).
    expect(frames).toEqual([
      "'self'",
      ...VIDEO_FRAME_ORIGINS,
      "https://challenges.cloudflare.com",
    ]);
    const embed = readFileSync(
      `${process.cwd()}/artifacts/proofstack/features/community/video-embed.tsx`,
      "utf8",
    );
    expect(embed).toContain('sandbox="allow-scripts allow-same-origin');
    expect(embed).not.toContain("allow-top-navigation");
  });
});
