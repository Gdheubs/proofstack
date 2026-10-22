"use client";

import { ChevronRight, File, FilePlus, Folder, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { buildTree, pathProblem, type TreeNode } from "./editor-api";

export type ChangeKind = "added" | "modified" | "deleted";
const MARK: Record<ChangeKind, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
};
const MARK_CLASS: Record<ChangeKind, string> = {
  added: "text-emerald-600 dark:text-emerald-400",
  modified: "text-amber-600 dark:text-amber-400",
  deleted: "text-red-600 dark:text-red-400 line-through",
};

export function FileTree({
  paths,
  changes,
  active,
  readOnly,
  onOpen,
  onCreate,
  onDelete,
}: {
  paths: string[];
  changes: Map<string, ChangeKind>;
  active: string | null;
  readOnly: boolean;
  onOpen: (path: string) => void;
  onCreate: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle
      ? paths.filter((p) => p.toLowerCase().includes(needle))
      : paths;
  }, [paths, filter]);
  const tree = useMemo(() => buildTree(visible), [visible]);
  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const expanded = (path: string) => !!filter.trim() || open.has(path);
  const row = (node: TreeNode, depth: number): React.ReactNode => {
    const change = changes.get(node.path);
    if (node.kind === "folder")
      return (
        <li key={node.path}>
          <button
            type="button"
            onClick={() => toggle(node.path)}
            aria-expanded={expanded(node.path)}
            className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted"
            style={{ paddingLeft: depth * 12 + 4 }}
          >
            <ChevronRight
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded(node.path) ? "rotate-90" : ""}`}
            />
            <Folder aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
          </button>
          {expanded(node.path) && (
            <ul>{node.children.map((c) => row(c, depth + 1))}</ul>
          )}
        </li>
      );
    return (
      <li key={node.path} className="group flex items-center">
        <button
          type="button"
          onClick={() => onOpen(node.path)}
          aria-current={active === node.path ? "true" : undefined}
          className={`flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted ${active === node.path ? "bg-muted font-medium" : ""}`}
          style={{ paddingLeft: depth * 12 + 22 }}
        >
          <File aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className={`truncate ${change ? MARK_CLASS[change] : ""}`}>
            {node.name}
          </span>
          {change && (
            <span
              className={`ml-auto pl-1 font-mono text-[10px] ${MARK_CLASS[change]}`}
              aria-label={change}
            >
              {MARK[change]}
            </span>
          )}
        </button>
        {!readOnly && change !== "deleted" && (
          <button
            type="button"
            onClick={() => onDelete(node.path)}
            aria-label={`Delete ${node.path}`}
            className="invisible rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:visible group-hover:visible"
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </li>
    );
  };
  return (
    <div className="flex h-full flex-col text-[13px]">
      <div className="flex items-center justify-between px-2 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              setProblem(null);
            }}
            aria-label="New file"
            title="New file"
            className="rounded p-1 hover:bg-muted"
          >
            <FilePlus aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
      {draft !== null && (
        <form
          className="space-y-1 px-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            const path = draft.trim().replace(/^\/+/, "");
            const p =
              pathProblem(path) ??
              (paths.includes(path) ? "That file already exists." : null);
            if (p) return setProblem(p);
            onCreate(path);
            setDraft(null);
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
            placeholder="src/new-file.ts"
            aria-label="New file path"
            className="w-full rounded border bg-background px-2 py-1 font-mono text-xs"
          />
          {problem && <p className="text-xs text-red-600">{problem}</p>}
        </form>
      )}
      <div className="px-2 pb-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter files"
          aria-label="Filter files"
          className="w-full rounded border bg-background px-2 py-1 text-xs"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-auto px-1 pb-4" aria-label="Files">
        {tree.map((node) => row(node, 0))}
        {!tree.length && (
          <li className="px-2 py-1 text-xs text-muted-foreground">
            {filter ? "No files match." : "No files yet."}
          </li>
        )}
      </ul>
    </div>
  );
}
