import { describe, expect, it, vi } from "vitest";
const path = `${process.cwd()}/scripts/dev-health.mjs`;
const payloads = [
  { status: "ok" },
  { status: "ready" },
  { provider: "firebase" },
  { authenticated: false, csrfToken: "disposable-test-csrf" },
];

describe("full-stack startup dependency probes", () => {
  it("requires liveness, real schema readiness, explicit auth config and an anonymous CSRF context", async () => {
    const { verifyApiReadiness } = await import(path);
    let index = 0;
    const request = vi.fn(
      async () => new Response(JSON.stringify(payloads[index++])),
    );
    await expect(
      verifyApiReadiness("http://127.0.0.1:8089", request),
    ).resolves.toBeUndefined();
    expect(request.mock.calls).toHaveLength(4);
  });
  it.each([0, 1, 2, 3])(
    "fails closed at dependency %s rather than starting a frontend against it",
    async (failed) => {
      const { verifyApiReadiness } = await import(path);
      let index = 0;
      const request = vi.fn(async () =>
        index++ === failed
          ? new Response("sensitive-upstream-details", { status: 503 })
          : new Response(JSON.stringify(payloads[index - 1])),
      );
      await expect(
        verifyApiReadiness("http://127.0.0.1:8089", request),
      ).rejects.toThrow("HTTP 503");
      expect(request.mock.calls).toHaveLength(failed + 1);
    },
  );
  it("does not interpret a status-200 error page as working authentication", async () => {
    const { verifyApiReadiness } = await import(path);
    let index = 0;
    const request = async () =>
      new Response(
        JSON.stringify(
          index++ === 2 ? { provider: "unknown" } : payloads[index - 1],
        ),
      );
    await expect(
      verifyApiReadiness("http://127.0.0.1:8089", request),
    ).rejects.toThrow("authentication configuration");
  });
  it("does not expose connection errors or malformed provider payloads", async () => {
    const { verifyApiReadiness } = await import(path);
    await expect(
      verifyApiReadiness("http://127.0.0.1:8089", async () => {
        throw new Error("private-connection-string");
      }),
    ).rejects.toThrow("API liveness");
  });
});
