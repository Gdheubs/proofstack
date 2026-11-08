// ProofStack code runner. Runs inside a sandboxed frame with an opaque
// origin (see public/_headers), so code here can never read the member's
// cookies or call ProofStack as them. Programs run in a worker
// created from this frame; the worker inherits the frame's policy, which
// allows network access only to the pinned Python engine on jsDelivr.
//
// Protocol (all messages through postMessage):
//   editor -> runner  {type:"run", id, kind:"python"|"javascript", code,
//                      entry, files:[{path, content}], input}
//                     {type:"stop", id}
//   runner -> editor  {type:"ready"}
//                     {type:"status", id, text}
//                     {type:"out", id, stream:"stdout"|"stderr", text}
//                     {type:"done", id, status, ms}
"use strict";
(function () {
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/";
  // SHA-384 of each core file of Pyodide 0.29.5; checked before Python starts.
  const PYODIDE_FILES = {
    "pyodide.mjs":
      "sha384-Rz62KUV65z4NpF1FvF14JmZUtlMVytKj4v6lLxOOgGRZD8rtkKXR2VuR++5m0Bbt",
    "pyodide.asm.js":
      "sha384-8mBRd9rjeP9blbPmWuCum2qq484+GPVFDSaebLOh+ryUrQZz9SJ4v2dh4STKX9Jo",
    "pyodide.asm.wasm":
      "sha384-8LoW84uYNGn2avpfQNVvzVXqylKrFwJgbBNJ87g6D5Ud+8bzAJzOV38jQkOpVBq7",
    "python_stdlib.zip":
      "sha384-qFTVfVvRHvt1V/9yXR9tJ0uAKF7men+qhxh13+YPQPYWYMAq4dKaaL6N+/DIo4gR",
    "pyodide-lock.json":
      "sha384-xDHcZeNLjl7+brzrlYDRbrxe3I9kROtVuWNljcqvsUtLl47M+jg2UGQ13S7KV5Xc",
  };
  const RUN_LIMIT_MS = 10000;
  const LOAD_LIMIT_MS = 90000;
  const OUTPUT_LIMIT = 1000000;

  // Python keeps a warm engine between runs. A JavaScript program can change
  // its worker's globals, so each JavaScript run gets a fresh worker.
  const workers = { python: null, javascript: null };
  let current = null; // {id, kind, startedAt, bytes, timer}

  const send = (message) => window.parent.postMessage(message, "*");
  const clearTimer = () => {
    if (current && current.timer) clearTimeout(current.timer);
  };
  function finish(status) {
    if (!current) return;
    clearTimer();
    if (current.kind === "javascript" && workers.javascript) {
      workers.javascript.terminate();
      workers.javascript = null;
    }
    const ms = current.startedAt ? Date.now() - current.startedAt : 0;
    send({ type: "done", id: current.id, status, ms });
    current = null;
  }
  function kill(status) {
    const kind = current ? current.kind : null;
    if (kind && workers[kind]) {
      workers[kind].terminate();
      workers[kind] = null;
    }
    finish(status);
  }
  function arm(ms, status) {
    clearTimer();
    current.timer = setTimeout(() => kill(status), ms);
  }

  // Everything below runs inside the worker. It is turned into source text,
  // so it may only use its argument and worker globals.
  function workerMain(config) {
    const post = self.postMessage.bind(self);
    let pyodide = null;
    let runId = null;
    let pending = 0;
    let settled = false;
    const out = (stream, text) =>
      post({ type: "out", id: runId, stream, text: String(text) });

    function inspect(value, depth, seen) {
      if (typeof value === "string") return depth ? JSON.stringify(value) : value;
      if (value === null || value === undefined) return String(value);
      if (typeof value === "bigint") return value + "n";
      if (typeof value === "symbol" || typeof value === "number" || typeof value === "boolean")
        return String(value);
      if (typeof value === "function") return "[Function " + (value.name || "anonymous") + "]";
      if (value instanceof Error) return value.stack || value.name + ": " + value.message;
      if (seen.has(value)) return "[Circular]";
      if (depth > 3) return Array.isArray(value) ? "[Array]" : "[Object]";
      seen.add(value);
      try {
        if (Array.isArray(value))
          return "[ " + value.map((v) => inspect(v, depth + 1, seen)).join(", ") + " ]";
        if (value instanceof Map)
          return "Map(" + value.size + ") { " +
            [...value].map(([k, v]) => inspect(k, depth + 1, seen) + " => " + inspect(v, depth + 1, seen)).join(", ") + " }";
        if (value instanceof Set)
          return "Set(" + value.size + ") { " + [...value].map((v) => inspect(v, depth + 1, seen)).join(", ") + " }";
        const entries = Object.keys(value).map((k) => k + ": " + inspect(value[k], depth + 1, seen));
        const name = value.constructor && value.constructor.name !== "Object" ? value.constructor.name + " " : "";
        return name + "{ " + entries.join(", ") + " }";
      } finally {
        seen.delete(value);
      }
    }
    const line = (args) => args.map((a) => inspect(a, 0, new Set())).join(" ") + "\n";
    for (const name of ["log", "info", "debug"])
      console[name] = (...args) => out("stdout", line(args));
    for (const name of ["warn", "error"])
      console[name] = (...args) => out("stderr", line(args));

    // Track timers so a JavaScript run ends when nothing is left to do.
    const realSetTimeout = self.setTimeout.bind(self);
    const realClearTimeout = self.clearTimeout.bind(self);
    const live = new Set();
    self.setTimeout = (fn, ms, ...args) => {
      const handle = realSetTimeout(() => {
        live.delete(handle);
        try {
          typeof fn === "function" ? fn(...args) : 0;
        } catch (error) {
          out("stderr", inspect(error, 0, new Set()) + "\n");
        }
        maybeDone();
      }, ms);
      live.add(handle);
      return handle;
    };
    self.clearTimeout = (handle) => {
      live.delete(handle);
      realClearTimeout(handle);
      maybeDone();
    };
    const realSetInterval = self.setInterval.bind(self);
    const realClearInterval = self.clearInterval.bind(self);
    self.setInterval = (fn, ms, ...args) => {
      const handle = realSetInterval(() => {
        try {
          typeof fn === "function" ? fn(...args) : 0;
        } catch (error) {
          out("stderr", inspect(error, 0, new Set()) + "\n");
        }
      }, ms);
      live.add(handle);
      return handle;
    };
    self.clearInterval = (handle) => {
      live.delete(handle);
      realClearInterval(handle);
      maybeDone();
    };
    function maybeDone() {
      if (settled && pending === 0 && live.size === 0)
        realSetTimeout(() => {
          if (settled && live.size === 0) {
            settled = false;
            post({ type: "end", id: runId, status: "ok" });
          }
        }, 0);
    }

    async function loadPython() {
      if (pyodide) return pyodide;
      post({ type: "status", id: runId, text: "Loading Python (the first run downloads about 12 MB)…" });
      for (const [name, integrity] of Object.entries(config.files)) {
        const response = await fetch(config.base + name, { integrity });
        if (!response.ok) throw new Error("Python could not be downloaded (" + name + ")");
        await response.arrayBuffer();
      }
      const loader = await fetch(config.base + "pyodide.mjs", { integrity: config.files["pyodide.mjs"] });
      const url = URL.createObjectURL(new Blob([await loader.text()], { type: "text/javascript" }));
      const module = await import(url);
      URL.revokeObjectURL(url);
      pyodide = await module.loadPyodide({ indexURL: config.base });
      return pyodide;
    }

    // Python tracebacks from the member's first frame on, without the
    // engine's own frames.
    function cleanTraceback(text) {
      const all = String(text).split("\n");
      const first = all.findIndex((l) => /^ {2}File "\/project\//.test(l));
      const lines =
        first > 0 ? ["Traceback (most recent call last):"].concat(all.slice(first)) : all;
      const kept = [];
      for (let i = 0; i < lines.length; i++) {
        if (/^ {2}File "\/lib\/python/.test(lines[i]) || /_pyodide/.test(lines[i])) {
          if (lines[i + 1] && /^ {4}/.test(lines[i + 1])) i++;
          while (lines[i + 1] && /^ {4}[\^~ ]+$/.test(lines[i + 1])) i++;
          continue;
        }
        kept.push(lines[i]);
      }
      return kept.join("\n").trim() + "\n";
    }

    async function runPython(message) {
      const py = await loadPython();
      const decoder = { out: new TextDecoder(), err: new TextDecoder() };
      py.setStdout({ write: (b) => (out("stdout", decoder.out.decode(b, { stream: true })), b.length) });
      py.setStderr({ write: (b) => (out("stderr", decoder.err.decode(b, { stream: true })), b.length) });
      const input = String(message.input || "").split("\n");
      if (input.length && input[input.length - 1] === "") input.pop();
      py.setStdin({
        stdin: () => {
          if (!input.length) return undefined;
          const next = input.shift();
          out("stdout", next + "\n");
          return next;
        },
      });
      // A fresh copy of the project for every run.
      py.runPython(
        "import sys, shutil, os\n" +
          "for _k, _m in list(sys.modules.items()):\n" +
          "    if (getattr(_m, '__file__', None) or '').startswith('/project/'): del sys.modules[_k]\n" +
          "shutil.rmtree('/project', ignore_errors=True)\n" +
          "os.makedirs('/project', exist_ok=True)",
      );
      for (const file of message.files || []) {
        const path = "/project/" + file.path;
        py.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")) || "/project");
        py.FS.writeFile(path, file.content);
      }
      const entry = "/project/" + message.entry;
      const folder = entry.slice(0, entry.lastIndexOf("/"));
      py.runPython(
        "import os, sys\nos.chdir(" + JSON.stringify(folder) + ")\n" +
          "sys.path[:] = [p for p in sys.path if not p.startswith('/project')]\n" +
          "sys.path.insert(0, " + JSON.stringify(folder) + ")",
      );
      post({ type: "status", id: runId, text: "Loading packages…" });
      await py.loadPackagesFromImports(message.code, {
        messageCallback: () => {},
        errorCallback: (text) => out("stderr", text + "\n"),
      });
      post({ type: "started", id: runId });
      const scope = py.globals.get("dict")();
      scope.set("__name__", "__main__");
      scope.set("__file__", entry);
      try {
        await py.runPythonAsync(message.code, { globals: scope, filename: entry });
        post({ type: "end", id: runId, status: "ok" });
      } catch (error) {
        out("stderr", cleanTraceback(error && error.message ? error.message : error));
        post({ type: "end", id: runId, status: "error" });
      } finally {
        scope.destroy();
        for (const flush of [decoder.out, decoder.err]) flush.decode();
      }
    }

    async function runJavaScript(message) {
      post({ type: "started", id: runId });
      const url = URL.createObjectURL(new Blob([message.code], { type: "text/javascript" }));
      const name = message.entry;
      const where = (text) => String(text).split(url).join(name);
      settled = false;
      pending = 1;
      self.addEventListener("unhandledrejection", (event) => {
        out("stderr", "Uncaught (in promise) " + where(inspect(event.reason, 0, new Set())) + "\n");
        event.preventDefault();
      });
      self.addEventListener("error", (event) => {
        out("stderr", where("Uncaught " + (event.error ? inspect(event.error, 0, new Set()) : event.message)) + "\n");
        event.preventDefault();
      });
      try {
        await import(url);
        pending = 0;
        settled = true;
        maybeDone();
      } catch (error) {
        out("stderr", where(inspect(error, 0, new Set())) + "\n");
        post({ type: "end", id: runId, status: "error" });
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    self.onmessage = async (event) => {
      const message = event.data || {};
      if (message.type !== "run") return;
      runId = message.id;
      try {
        if (message.kind === "python") await runPython(message);
        else await runJavaScript(message);
      } catch (error) {
        out("stderr", (error && error.message ? error.message : String(error)) + "\n");
        post({ type: "end", id: runId, status: "error" });
      }
    };
  }

  function spawn() {
    const source =
      "(" + workerMain.toString() + ")(" +
      JSON.stringify({ base: PYODIDE, files: PYODIDE_FILES }) + ");";
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    // A classic worker: module workers cannot start in an opaque origin, and
    // dynamic import() works in classic workers.
    const created = new Worker(url);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    created.onmessage = (event) => {
      const message = event.data;
      // Messages come from member code too: accept only well-formed ones
      // for the current run.
      if (!current || !message || message.id !== current.id) return;
      if (message.type === "status") {
        send({ type: "status", id: current.id, text: String(message.text).slice(0, 200) });
      } else if (message.type === "started") {
        if (current.startedAt) return;
        current.startedAt = Date.now();
        arm(RUN_LIMIT_MS, "timeout");
      } else if (message.type === "out") {
        const text = String(message.text);
        current.bytes += text.length;
        if (current.bytes > OUTPUT_LIMIT) {
          send({ type: "out", id: current.id, stream: "stderr", text: "\n[Output limit of 1 MB reached; the program was stopped.]\n" });
          kill("limit");
          return;
        }
        send({ type: "out", id: current.id, stream: message.stream === "stderr" ? "stderr" : "stdout", text });
      } else if (message.type === "end") {
        // A JavaScript program may still have timers; Python is finished.
        finish(message.status === "error" ? "error" : "ok");
      }
    };
    created.onerror = (event) => {
      if (!current) return;
      send({ type: "out", id: current.id, stream: "stderr", text: (event.message || "The runner failed to start") + "\n" });
      event.preventDefault();
      kill("error");
    };
    return created;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const message = event.data || {};
    if (message.type === "stop") {
      if (current && message.id === current.id) kill("stopped");
      return;
    }
    if (message.type !== "run" || typeof message.id !== "string") return;
    if (current) kill("stopped");
    const kind = message.kind === "python" ? "python" : "javascript";
    if (kind === "javascript" && workers.javascript)
      workers.javascript.terminate();
    if (kind === "javascript" || !workers.python) workers[kind] = spawn();
    const worker = workers[kind];
    current = { id: message.id, kind, startedAt: 0, bytes: 0, timer: null };
    arm(LOAD_LIMIT_MS, "timeout");
    worker.postMessage({
      type: "run",
      id: message.id,
      kind,
      code: String(message.code || ""),
      entry: String(message.entry || "main"),
      input: String(message.input || ""),
      files: Array.isArray(message.files) ? message.files : [],
    });
  });

  send({ type: "ready" });
})();
