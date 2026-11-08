"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunStatus } from "./run-api";

// Talks to the sealed runner page (public/runner/run) through postMessage.
// The page has an opaque origin, so its messages arrive from origin "null";
// only messages from our own runner frame are accepted, and output is shown
// as plain text.
export type OutputChunk = { stream: "stdout" | "stderr"; text: string };
export type RunRequest = {
  kind: "python" | "javascript";
  code: string;
  entry: string;
  input: string;
  files: { path: string; content: string }[];
};
const CLIENT_OUTPUT_LIMIT = 1_100_000;

export function useRunner() {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef<Promise<void> | null>(null);
  const markReady = useRef<() => void>(() => {});
  const runId = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [note, setNote] = useState("");
  const [output, setOutput] = useState<OutputChunk[]>([]);
  const [ms, setMs] = useState(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow)
        return;
      const message = event.data as Record<string, unknown> | null;
      if (!message || typeof message !== "object") return;
      if (message.type === "ready") {
        markReady.current();
        return;
      }
      if (message.id !== runId.current) return;
      if (message.type === "status") {
        setNote(String(message.text ?? ""));
      } else if (message.type === "out") {
        const stream = message.stream === "stderr" ? "stderr" : "stdout";
        const text = String(message.text ?? "");
        setStatus("running");
        setNote("");
        setOutput((chunks) => {
          const size = chunks.reduce((n, c) => n + c.text.length, 0);
          if (size > CLIENT_OUTPUT_LIMIT) return chunks;
          const last = chunks.at(-1);
          // Merge into the previous chunk to keep the output cheap to render.
          if (last && last.stream === stream)
            return [...chunks.slice(0, -1), { stream, text: last.text + text }];
          return [...chunks, { stream, text }];
        });
      } else if (message.type === "done") {
        const result = String(message.status);
        setStatus(
          (["ok", "error", "timeout", "stopped", "limit"] as const).find(
            (s) => s === result,
          ) ?? "error",
        );
        setMs(Number(message.ms) || 0);
        setNote("");
        runId.current = null;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const run = useCallback(async (request: RunRequest) => {
    if (!ready.current) {
      ready.current = new Promise<void>((resolve) => {
        markReady.current = resolve;
      });
      setMounted(true);
    }
    const id = crypto.randomUUID();
    runId.current = id;
    setOutput([]);
    setMs(0);
    setStatus("loading");
    setNote("");
    await ready.current;
    if (runId.current !== id) return;
    // The runner has an opaque origin, so "*" is the only possible target;
    // the frame is ours and loaded from our own address.
    frame.current?.contentWindow?.postMessage(
      { type: "run", id, ...request },
      "*",
    );
  }, []);

  const stop = useCallback(() => {
    const id = runId.current;
    if (id)
      frame.current?.contentWindow?.postMessage({ type: "stop", id }, "*");
  }, []);

  const fail = useCallback((text: string) => {
    runId.current = null;
    setOutput([{ stream: "stderr", text: text + "\n" }]);
    setStatus("error");
    setNote("");
    setMs(0);
  }, []);

  const clear = useCallback(() => {
    setOutput([]);
    if (!runId.current) setStatus("idle");
  }, []);

  const frameElement = mounted ? (
    <iframe
      ref={frame}
      title="Code runner"
      src="/runner/run/"
      sandbox="allow-scripts"
      aria-hidden="true"
      tabIndex={-1}
      className="hidden"
    />
  ) : null;

  return { frameElement, run, stop, fail, clear, status, note, output, ms };
}
