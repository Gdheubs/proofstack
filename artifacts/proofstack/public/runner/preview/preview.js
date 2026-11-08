// ProofStack page preview. Runs in a sandboxed frame with an opaque origin
// (see public/_headers). The editor sends one page and the text files it
// links to; links are pointed at in-memory copies, images at the repository's
// public raw address, and the page replaces this document.
//
//   editor -> preview  {type:"preview", entry, files:{path: content}, assetBase}
//   preview -> editor  {type:"preview-ready"}
"use strict";
(function () {
  // "a/b/c.html" + "../d.css" -> "a/d.css"; null for absolute or data URLs.
  function resolve(from, ref) {
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return null;
    const clean = ref.split(/[?#]/)[0];
    const parts = clean.startsWith("/") ? [] : from.split("/").slice(0, -1);
    for (const part of clean.replace(/^\//, "").split("/")) {
      if (part === "..") parts.pop();
      else if (part && part !== ".") parts.push(part);
    }
    return parts.join("/");
  }
  const TYPES = { css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json", svg: "image/svg+xml" };
  const typeOf = (path) => TYPES[path.split(".").pop().toLowerCase()] || "text/plain";

  function render(message) {
    const files = message.files || {};
    const entry = String(message.entry || "index.html");
    const assetBase = typeof message.assetBase === "string" ? message.assetBase : "";
    const urls = {};
    const target = (from, ref) => {
      const path = resolve(from, ref);
      if (path === null) return ref;
      if (urls[path]) return urls[path];
      return assetBase ? assetBase + path.split("/").map(encodeURIComponent).join("/") : ref;
    };
    // Stylesheets first: their url(...) references point at files or assets.
    for (const path of Object.keys(files)) {
      let text = String(files[path]);
      if (/\.css$/i.test(path))
        text = text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_, q, ref) => "url(" + q + target(path, ref) + q + ")");
      if (path !== entry)
        urls[path] = URL.createObjectURL(new Blob([text], { type: typeOf(path) }));
    }
    const doc = new DOMParser().parseFromString(String(files[entry] || ""), "text/html");
    for (const element of doc.querySelectorAll("[src], link[href], [poster]")) {
      for (const attribute of ["src", "href", "poster"]) {
        const value = element.getAttribute(attribute);
        if (value) element.setAttribute(attribute, target(entry, value));
      }
    }
    for (const element of doc.querySelectorAll("[style]"))
      element.setAttribute(
        "style",
        element.getAttribute("style").replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_, q, ref) => "url(" + q + target(entry, ref) + q + ")"),
      );
    for (const style of doc.querySelectorAll("style"))
      style.textContent = style.textContent.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_, q, ref) => "url(" + q + target(entry, ref) + q + ")");
    // Links to other pages cannot be followed inside the preview.
    for (const link of doc.querySelectorAll("a[href]")) {
      const path = resolve(entry, link.getAttribute("href"));
      if (path !== null) link.setAttribute("href", "#");
    }
    document.open();
    document.write("<!doctype html>\n" + doc.documentElement.outerHTML);
    document.close();
  }

  window.addEventListener("message", function onMessage(event) {
    if (event.source !== window.parent) return;
    const message = event.data || {};
    if (message.type !== "preview") return;
    window.removeEventListener("message", onMessage);
    render(message);
  });
  window.parent.postMessage({ type: "preview-ready" }, "*");
})();
