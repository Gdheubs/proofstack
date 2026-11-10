import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_PYTHON_FILES,
  hasRelativeImport,
  htmlReferences,
  pageFiles,
  pythonFiles,
  rawAssetBase,
  resolvePath,
  runKind,
} from "../artifacts/proofstack/features/editor/run-api";

const root = `${process.cwd()}/artifacts/proofstack`;

describe("run helpers", () => {
  it("knows which files can run", () => {
    expect(runKind("src/main.py")).toBe("python");
    expect(runKind("a.JS")).toBe("javascript");
    expect(runKind("a.mjs")).toBe("javascript");
    expect(runKind("a.ts")).toBe("typescript");
    expect(runKind("site/index.html")).toBe("html");
    for (const path of ["a.java", "a.tsx", "README.md", "Makefile", "py"])
      expect(runKind(path)).toBeNull();
  });

  it("resolves page links inside the repository only", () => {
    expect(resolvePath("site/index.html", "css/a.css")).toBe("site/css/a.css");
    expect(resolvePath("site/pages/x.html", "../js/a.js")).toBe("site/js/a.js");
    expect(resolvePath("site/index.html", "./b.css?v=2#x")).toBe("site/b.css");
    expect(resolvePath("site/index.html", "/root.css")).toBe("root.css");
    expect(resolvePath("a.html", "../../escape.js")).toBe("escape.js");
    for (const ref of [
      "https://x.test/a.js",
      "//cdn.test/a.js",
      "data:x",
      "#top",
      "mailto:a@b",
      "",
    ])
      expect(resolvePath("site/index.html", ref)).toBeNull();
  });

  it("finds the stylesheets and scripts a page links to", () => {
    const html = `<link rel="stylesheet" href="css/a.css"><script src='js/app.js'></script>
      <img src=img/logo.png><a href="about.html">x</a><script src="https://cdn.test/x.js"></script>`;
    expect(htmlReferences(html)).toEqual([
      "css/a.css",
      "js/app.js",
      "img/logo.png",
      "about.html",
      "https://cdn.test/x.js",
    ]);
    const paths = new Set([
      "site/css/a.css",
      "site/js/app.js",
      "site/img/logo.png",
      "site/about.html",
    ]);
    expect(pageFiles("site/index.html", html, paths)).toEqual([
      "site/css/a.css",
      "site/js/app.js",
    ]);
  });

  it("sends every Python file in small projects, the program's folder in large ones", () => {
    const small = ["a.py", "pkg/b.py", "README.md"];
    expect(pythonFiles(small, "a.py")).toEqual(["a.py", "pkg/b.py"]);
    const many = Array.from({ length: 100 }, (_, i) => `other/m${i}.py`);
    const chosen = pythonFiles(
      [...many, "app/main.py", "app/lib/util.py"],
      "app/main.py",
    );
    expect(chosen).toEqual(["app/main.py", "app/lib/util.py"]);
    expect(pythonFiles(many, "top.py")).toHaveLength(MAX_PYTHON_FILES);
  });

  it("spots JavaScript that imports other repository files", () => {
    expect(hasRelativeImport("import { a } from './a.js';")).toBe(true);
    expect(hasRelativeImport('export * from "../lib";')).toBe(true);
    expect(hasRelativeImport("const m = await import('./m.js')")).toBe(true);
    expect(hasRelativeImport("import './side-effect.js'")).toBe(true);
    expect(hasRelativeImport("console.log('./not an import')")).toBe(false);
    expect(hasRelativeImport("import x from 'https://cdn.test/x.js'")).toBe(
      false,
    );
  });

  it("points preview images at the public raw address of GitHub repositories", () => {
    expect(rawAssetBase("github", "octo/app", "feature/x y")).toBe(
      "https://raw.githubusercontent.com/octo/app/feature/x%20y/",
    );
    expect(rawAssetBase("hosted", "id", "main")).toBe("");
  });
});

describe("runner sandbox policy", () => {
  const headers = readFileSync(`${root}/public/_headers`, "utf8");
  const policy = (path: string) => {
    const block = headers
      .split(/\r?\n\r?\n/)
      .find(
        (b) =>
          b.includes(`\n${path}\n`) ||
          b.startsWith(`${path}\n`) ||
          b.includes(`${path}\r\n`),
      );
    return /Content-Security-Policy: (.*)/.exec(block ?? "")?.[1] ?? "";
  };
  it("seals the runner: opaque origin, no network but the pinned Python engine", () => {
    const csp = policy("/runner/run/*");
    expect(csp).toMatch(/^sandbox allow-scripts;/);
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("connect-src https://cdn.jsdelivr.net;");
    expect(csp).toContain("frame-ancestors 'self'");
  });
  it("seals the preview: opaque origin, no forms or top navigation", () => {
    const csp = policy("/runner/preview/*");
    expect(csp).toMatch(/^sandbox allow-scripts;/);
    expect(csp).not.toMatch(
      /allow-same-origin|allow-top-navigation|allow-forms|allow-popups|allow-modals/,
    );
    expect(csp).toContain("form-action 'none'");
  });
  it("pins the Python engine and checks every core file", () => {
    const runner = readFileSync(`${root}/public/runner/run/run.js`, "utf8");
    expect(runner).toContain(
      '"https://cdn.jsdelivr.net/pyodide/v0.29.5/full/"',
    );
    for (const file of [
      "pyodide.mjs",
      "pyodide.asm.js",
      "pyodide.asm.wasm",
      "python_stdlib.zip",
      "pyodide-lock.json",
    ])
      expect(runner).toMatch(
        new RegExp(
          `"${file.replace(/\./g, "\\.")}":\\s*"sha384-[A-Za-z0-9+/]{64}"`,
        ),
      );
  });
  it("embeds the runner frames sandboxed in the editor too", () => {
    const hook = readFileSync(`${root}/features/editor/use-runner.tsx`, "utf8");
    const panel = readFileSync(`${root}/features/editor/run-panel.tsx`, "utf8");
    expect(hook).toContain('sandbox="allow-scripts"');
    expect(panel).toContain('sandbox="allow-scripts"');
    for (const source of [hook, panel]) {
      expect(source).not.toContain("allow-same-origin");
      expect(source).not.toContain("dangerouslySetInnerHTML");
    }
  });
});
