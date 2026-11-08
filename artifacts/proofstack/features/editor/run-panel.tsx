"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { onTabKeyDown, tabProps } from "@/lib/a11y";
import { STATUS_LABEL, type RunStatus } from "./run-api";
import type { OutputChunk } from "./use-runner";

export type RunTab = "output" | "input" | "preview";
export type PreviewPayload = {
  entry: string;
  files: Record<string, string>;
  assetBase: string;
};
const TABS: [RunTab, string][] = [
  ["output", "Output"],
  ["input", "Input"],
  ["preview", "Preview"],
];
const NOTE_KEY = "ps-run-note-v1";

// The sealed page preview (public/runner/preview). A fresh frame per update,
// so a previewed page never outlives its version.
function PreviewFrame({ payload }: { payload: PreviewPayload }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type !== "preview-ready")
        return;
      ref.current?.contentWindow?.postMessage(
        { type: "preview", ...payload },
        "*",
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [payload]);
  return (
    <iframe
      ref={ref}
      title={`Preview of ${payload.entry}`}
      src="/runner/preview/"
      sandbox="allow-scripts allow-modals"
      className="h-full w-full bg-white"
    />
  );
}

export function RunPanel({
  tab,
  onTab,
  status,
  note,
  output,
  ms,
  input,
  onInput,
  preview,
  previewVersion,
  onRun,
  onStop,
  onClear,
  onClose,
  canRun,
}: {
  tab: RunTab;
  onTab: (tab: RunTab) => void;
  status: RunStatus;
  note: string;
  output: OutputChunk[];
  ms: number;
  input: string;
  onInput: (value: string) => void;
  preview: PreviewPayload | null;
  previewVersion: number;
  onRun: () => void;
  onStop: () => void;
  onClear: () => void;
  onClose: () => void;
  canRun: boolean;
}) {
  const busy = status === "loading" || status === "running";
  const [showNote, setShowNote] = useState(false);
  useEffect(() => {
    try {
      setShowNote(!window.localStorage.getItem(NOTE_KEY));
    } catch {
      setShowNote(true);
    }
  }, []);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [output]);
  const tabs = TABS.filter(([key]) => key !== "preview" || preview);
  return (
    <section
      aria-label="Run"
      className="flex h-[40%] min-h-40 shrink-0 flex-col border-t bg-background"
    >
      <div className="flex items-center gap-1 border-b px-2">
        <div role="tablist" aria-label="Run panel" className="flex">
          {tabs.map(([key, label], i) => (
            <button
              key={key}
              type="button"
              {...tabProps(tab === key)}
              onClick={() => onTab(key)}
              onKeyDown={(e) =>
                onTabKeyDown(e, i, tabs.length, (n) => onTab(tabs[n]![0]))
              }
              className={`-mb-px border-b-2 px-3 py-1.5 text-xs ${tab === key ? "border-primary font-medium dark:border-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"
          role="status"
        >
          {busy && (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          )}
          {note || STATUS_LABEL[status]}
          {!busy &&
            status !== "idle" &&
            ms > 0 &&
            ` · ${(ms / 1000).toFixed(1)} s`}
        </span>
        {busy ? (
          <Button size="sm" variant="ghost" className="h-7" onClick={onStop}>
            <Square aria-hidden="true" className="h-3.5 w-3.5" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={!canRun}
            onClick={onRun}
          >
            <Play aria-hidden="true" className="h-3.5 w-3.5" />
            Run
          </Button>
        )}
        <button
          type="button"
          aria-label="Close the run panel"
          className="rounded p-1 hover:bg-muted"
          onClick={onClose}
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      {showNote && (
        <div
          className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs"
          role="note"
        >
          Code runs on your own device, in a sealed sandbox with no access to
          your ProofStack account. Python downloads once, about 12 MB.
          <button
            type="button"
            className="underline"
            onClick={() => {
              setShowNote(false);
              try {
                window.localStorage.setItem(NOTE_KEY, "1");
              } catch {
                /* Private browsing may block storage. */
              }
            }}
          >
            Got it
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto" role="tabpanel">
        {tab === "output" ? (
          <div className="p-3 font-mono text-xs">
            {output.length ? (
              <pre className="whitespace-pre-wrap break-words">
                {output.map((chunk, i) => (
                  <span
                    key={i}
                    className={
                      chunk.stream === "stderr"
                        ? "text-red-600 dark:text-red-400"
                        : undefined
                    }
                  >
                    {chunk.text}
                  </span>
                ))}
              </pre>
            ) : (
              <p className="text-muted-foreground">
                {busy
                  ? "Waiting for output…"
                  : "Press Run (Ctrl/⌘ + Enter) to run the open file. Python, JavaScript and TypeScript run here; HTML pages open in Preview."}
              </p>
            )}
            <div ref={end} />
            {output.length > 0 && !busy && (
              <button
                type="button"
                className="mt-2 text-muted-foreground underline"
                onClick={onClear}
              >
                Clear output
              </button>
            )}
          </div>
        ) : tab === "input" ? (
          <label className="flex h-full flex-col gap-1 p-3 text-xs">
            <span className="text-muted-foreground">
              What the program reads, one line per input() or read. Set it
              before pressing Run.
            </span>
            <textarea
              value={input}
              onChange={(e) => onInput(e.target.value)}
              className="min-h-0 flex-1 resize-none rounded border bg-background p-2 font-mono"
              placeholder={"Ada\n42"}
            />
          </label>
        ) : preview ? (
          <PreviewFrame key={previewVersion} payload={preview} />
        ) : null}
      </div>
    </section>
  );
}
