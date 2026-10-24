"use client";

import { ExternalLink, GitPullRequest } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  editorApi,
  type EditorBranch,
  type EditorRepository,
  type PullRequest,
} from "./editor-api";

const inputCls =
  "w-full rounded border bg-background px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-ring";

// Pull requests for the open GitHub repository: the open list, and a form
// that proposes the current branch to the repository (or, for a fork, to
// the repository it was forked from).
export function PullPanel({
  csrf,
  repository,
  branch,
  branches,
  initialTitle,
  busy,
  run,
  onNotice,
}: {
  csrf: string;
  repository: EditorRepository;
  branch: string;
  branches: EditorBranch[];
  initialTitle: string;
  busy: boolean;
  run: (label: string, fn: () => Promise<void>) => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [detail, setDetail] = useState<EditorRepository | null>(
    repository.parent === undefined ? null : repository,
  );
  const [pulls, setPulls] = useState<PullRequest[] | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState("");
  const [base, setBase] = useState("");

  const target = detail?.parent ?? null;
  // Where the pull request is opened, and how GitHub names the head branch.
  const targetRepo = target?.id ?? repository.id;
  const headOwner = target ? repository.id.split("/")[0] : undefined;
  const defaultBase = target?.defaultBranch ?? repository.defaultBranch;

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);
  useEffect(() => {
    setBase(defaultBase);
  }, [defaultBase, repository.id]);
  useEffect(() => {
    let cancelled = false;
    setPulls(null);
    void run("Loading pull requests", async () => {
      const info =
        repository.parent === undefined
          ? (await editorApi.repository(repository.id)).repository
          : repository;
      const list = (
        await editorApi.pullRequests(info.parent?.id ?? repository.id)
      ).pullRequests;
      if (cancelled) return;
      setDetail(info);
      setPulls(list);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository.id]);

  const sameRepo = !headOwner;
  const canPropose =
    !!detail &&
    repository.canWrite &&
    !!branch &&
    (!sameRepo || branch !== base);
  const submit = () => {
    if (title.trim().length < 3)
      return onNotice("Give the pull request a title (at least 3 characters).");
    void run("Opening pull request", async () => {
      const result = await editorApi.createPullRequest(csrf, {
        repo: targetRepo,
        base,
        head: branch,
        ...(headOwner ? { headOwner } : {}),
        title: title.trim(),
        ...(body.trim() ? { body: body.trim() } : {}),
      });
      setPulls((list) => [result.pullRequest, ...(list ?? [])]);
      setTitle("");
      setBody("");
      onNotice(`${result.message}: ${result.pullRequest.url}`);
    });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-[13px]">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        Pull requests
      </span>
      {pulls === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : pulls.length ? (
        <ul className="space-y-2" aria-label="Open pull requests">
          {pulls.map((p) => (
            <li key={p.number} className="space-y-0.5">
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-1 hover:underline"
              >
                <GitPullRequest
                  aria-hidden="true"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1 break-words">
                  #{p.number} {p.title}
                  {p.draft ? " (draft)" : ""}
                </span>
                <ExternalLink
                  aria-hidden="true"
                  className="mt-0.5 h-3 w-3 shrink-0"
                />
              </a>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {p.head} → {p.base}
                {p.author ? ` · ${p.author}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          No open pull requests on {targetRepo}.
        </p>
      )}
      <div className="space-y-2 border-t pt-3">
        <p className="text-xs font-medium">
          Propose {branch || "this branch"}
          {headOwner ? ` from your fork` : ""} to {targetRepo}
        </p>
        {!repository.canWrite ? (
          <p className="text-xs text-muted-foreground">
            Fork this repository first, then commit your change to a branch of
            the fork.
          </p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-xs">Base branch</span>
              {sameRepo ? (
                <select
                  aria-label="Base branch"
                  className={inputCls}
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label="Base branch"
                  className={`${inputCls} font-mono`}
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                />
              )}
            </label>
            {sameRepo && branch === base && (
              <p className="text-xs text-muted-foreground">
                Commit to a new branch first; a pull request compares two
                branches.
              </p>
            )}
            <label className="block space-y-1">
              <span className="text-xs">Title</span>
              <input
                className={inputCls}
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What does this change?"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs">Description (optional)</span>
              <textarea
                className={inputCls}
                rows={3}
                maxLength={5000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Why, and anything a reviewer should know"
              />
            </label>
            <Button
              size="sm"
              disabled={busy || !canPropose || !base.trim()}
              onClick={submit}
            >
              <GitPullRequest aria-hidden="true" className="h-3.5 w-3.5" />
              Open pull request
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
