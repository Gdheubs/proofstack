import { describe, expect, it } from "vitest";
import worker, { contentType, resolve } from "../artifacts/demos/worker";
import { demoFiles } from "../artifacts/api-server/src/services/repository-demo";

const prefix = "private/demos";

describe("demo site addresses", () => {
  it("maps /<handle>/<repo>/… to objects under the demo prefix only", () => {
    expect(resolve("/Suhai/QA-App/", prefix)).toEqual({
      kind: "file",
      key: "private/demos/suhai/qa-app/index.html",
      type: "text/html; charset=utf-8",
    });
    expect(resolve("/suhai/app/css/site.css", prefix)).toMatchObject({
      key: "private/demos/suhai/app/css/site.css",
      type: "text/css; charset=utf-8",
    });
    expect(resolve("/suhai/app/docs/", prefix)).toMatchObject({
      key: "private/demos/suhai/app/docs/index.html",
    });
    expect(resolve("/suhai/app", prefix)).toEqual({
      kind: "redirect",
      location: "/suhai/app/",
    });
    expect(resolve("/", prefix)).toEqual({ kind: "home" });
  });
  it("refuses anything that could leave the demo's folder", () => {
    for (const path of [
      "/suhai/app/../other/index.html",
      "/suhai/app/%2e%2e/secret",
      "/suhai/../x/y",
      "/../private/x",
      "/suhai/app/a//b",
      "/suhai/app/a%5Cb",
      "/suhai/app/a%00b",
      "/-bad/app/",
      "/suhai/%E0%A4%A/",
      "/onlyone",
    ])
      expect(resolve(path, prefix).kind, path).toBe("missing");
  });
  it("labels file types and serves with safe headers", async () => {
    expect(contentType("a.WEBP")).toBe("image/webp");
    expect(contentType("unknown.bin")).toBe("application/octet-stream");
    const stored = new Map([
      [
        "private/demos/suhai/app/index.html",
        { body: new Response("<h1>hi</h1>").body!, size: 11, httpEtag: '"e1"' },
      ],
    ]);
    const env = {
      DEMO_PREFIX: prefix,
      DEMOS: { get: async (key: string) => stored.get(key) ?? null },
    };
    const ok = await worker.fetch(
      new Request("https://demos.example/suhai/app/"),
      env,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await ok.text()).toBe("<h1>hi</h1>");
    const missing = await worker.fetch(
      new Request("https://demos.example/suhai/app/nope.html"),
      env,
    );
    expect(missing.status).toBe(404);
    const redirect = await worker.fetch(
      new Request("https://demos.example/suhai/app?x=1"),
      env,
    );
    expect([redirect.status, redirect.headers.get("location")]).toEqual([
      301,
      "/suhai/app/?x=1",
    ]);
    const post = await worker.fetch(
      new Request("https://demos.example/suhai/app/", { method: "POST" }),
      env,
    );
    expect(post.status).toBe(405);
  });
});

describe("choosing what a demo publishes", () => {
  const file = (path: string, size = 10) => ({ path, size, oid: path });
  it("uses the top-level site, or the first build folder with an index.html", () => {
    expect(
      demoFiles([file("index.html"), file("a.css"), file("dist/index.html")])
        .files.map((f) => f.key)
        .sort(),
    ).toEqual(["a.css", "dist/index.html", "index.html"]);
    const built = demoFiles([
      file("README.md"),
      file("src/app.ts"),
      file("dist/index.html"),
      file("dist/assets/app.js"),
    ]);
    expect(built.folder).toBe("dist");
    expect(built.files.map((f) => f.key)).toEqual([
      "index.html",
      "assets/app.js",
    ]);
  });
  it("explains a missing index.html and enforces the limits", () => {
    expect(() => demoFiles([file("README.md")])).toThrow(/index\.html/);
    expect(() =>
      demoFiles(
        Array.from({ length: 501 }, (_, i) => file(i ? `f${i}` : "index.html")),
      ),
    ).toThrow(/500 files/);
    expect(() => demoFiles([file("index.html", 26 * 1024 * 1024)])).toThrow(
      /25 MB/,
    );
  });
});
