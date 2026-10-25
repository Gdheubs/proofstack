"use client";

import {
  Files,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCsrf } from "@/hooks/use-community";
import {
  EditorError,
  branchProblem,
  editorApi,
  parseRepository,
  type EditorBranch,
  type EditorFile,
  type EditorRepository,
  type EditorSources,
  type EditorTree,
  type Source,
} from "./editor-api";
import { onTabKeyDown, tabProps } from "@/lib/a11y";
import { EditorPane, languageName } from "./editor-pane";
import { FileTree, type ChangeKind } from "./file-tree";
import { PullPanel } from "./pull-panel";

type Panel = "explorer" | "changes" | "pulls";
const SOURCE_LABEL: Record<Source, string> = {
  github: "GitHub",
  hosted: "ProofStack",
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Try again.";
const selectCls =
  "h-8 min-w-0 rounded border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring";

export function Workbench() {
  const { csrf, canAct, session } = useCsrf();
  const [sources, setSources] = useState<EditorSources | null>(null);
  const [source, setSource] = useState<Source>("github");
  const [repos, setRepos] = useState<EditorRepository[]>([]);
  const [repo, setRepo] = useState("");
  const [branches, setBranches] = useState<EditorBranch[]>([]);
  const [branch, setBranch] = useState("");
  const [tree, setTree] = useState<EditorTree | null>(null);
  // Originals as loaded from the repository, and the user's edits
  // (null marks a deleted file).
  const [originals, setOriginals] = useState<Map<string, EditorFile>>(
    () => new Map(),
  );
  const [edits, setEdits] = useState<Map<string, string | null>>(
    () => new Map(),
  );
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("explorer");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; code?: string } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [useNewBranch, setUseNewBranch] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  // Opening any GitHub repository by name, and a suggested pull-request title
  // after a commit to a branch.
  const [openForm, setOpenForm] = useState(false);
  const [openName, setOpenName] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [offerPr, setOfferPr] = useState(false);
  const loaded = useRef(new Set<string>());

  const repository = repos.find((r) => r.id === repo);
  const head = tree?.head ?? "";
  const readOnly = !repository?.canWrite;
  const filePaths = useMemo(() => {
    const set = new Set(tree?.files.map((f) => f.path));
    for (const [path, content] of edits) if (content !== null) set.add(path);
    return [...set].sort();
  }, [tree, edits]);
  const changes = useMemo(() => {
    const kinds = new Map<string, ChangeKind>();
    const inTree = new Set(tree?.files.map((f) => f.path));
    for (const [path, content] of edits) {
      if (!inTree.has(path)) {
        if (content !== null) kinds.set(path, "added");
      } else if (content === null) kinds.set(path, "deleted");
      else if (content !== originals.get(path)?.content)
        kinds.set(path, "modified");
    }
    return kinds;
  }, [edits, originals, tree]);
  const dirty = changes.size > 0;

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError({
        text: message(e),
        code: e instanceof EditorError ? e.code : undefined,
      });
    } finally {
      setBusy(null);
    }
  }, []);
  const resetWork = () => {
    setOriginals(new Map());
    setEdits(new Map());
    setTabs([]);
    setActive(null);
    loaded.current = new Set();
  };
  // Switching repository or branch discards edits only after confirmation.
  const guard = (action: () => void) => {
    if (dirty) setPending(() => action);
    else action();
  };

  useEffect(() => {
    if (!canAct) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("github");
    if (result === "connected") setNotice("GitHub connected.");
    if (result === "failed")
      setError({ text: "GitHub was not connected. Try again." });
    void run("Loading", async () => {
      const s = await editorApi.sources();
      setSources(s);
      const wanted = params.get("source");
      setSource(
        wanted === "hosted" || (!s.github.available && s.hosted.available)
          ? "hosted"
          : "github",
      );
      if (params.get("repo")) setRepo(params.get("repo")!);
    });
  }, [canAct, run]);

  const ready =
    !!sources &&
    (source === "github"
      ? sources.github.available && sources.github.connected
      : sources.hosted.available);
  useEffect(() => {
    if (!ready) return;
    void run("Loading repositories", async () => {
      const list = (await editorApi.repositories(source)).repositories;
      setRepos(list);
      setRepo((current) =>
        list.some((r) => r.id === current) ? current : (list[0]?.id ?? ""),
      );
    });
  }, [ready, source, run]);

  const loadTree = useCallback(
    (name: string) =>
      run("Loading files", async () => {
        setTree(await editorApi.tree(source, repo, name));
      }),
    [run, source, repo],
  );
  useEffect(() => {
    if (!ready || !repo) return;
    resetWork();
    setTree(null);
    void run("Loading branches", async () => {
      const list = (await editorApi.branches(source, repo)).branches;
      setBranches(list);
      const preferred = repos.find((r) => r.id === repo)?.defaultBranch;
      const next = list.some((b) => b.name === preferred)
        ? preferred!
        : (list[0]?.name ?? "");
      setBranch(next);
      if (next) setTree(await editorApi.tree(source, repo, next));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, source, repo]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const open = (path: string) => {
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActive(path);
    if (loaded.current.has(path) || !tree?.files.some((f) => f.path === path))
      return;
    loaded.current.add(path);
    void run("Opening file", async () => {
      try {
        const file = await editorApi.file(source, repo, branch, path);
        setOriginals((m) => new Map(m).set(path, file));
      } catch (e) {
        // Let a later click retry.
        loaded.current.delete(path);
        throw e;
      }
    });
  };
  const close = (path: string) => {
    setTabs((t) => {
      const next = t.filter((p) => p !== path);
      if (active === path) setActive(next.at(-1) ?? null);
      return next;
    });
  };
  const contentOf = (path: string) =>
    edits.has(path)
      ? (edits.get(path) ?? "")
      : (originals.get(path)?.content ?? "");
  const activeFile = active ? originals.get(active) : undefined;
  const activeIsNew = !!active && !tree?.files.some((f) => f.path === active);
  const activeLoading = !!active && !activeIsNew && !activeFile;
  const activeEditable =
    !readOnly &&
    (activeIsNew || !!activeFile?.editable) &&
    edits.get(active!) !== null;
  const onCursor = useCallback(
    (line: number, column: number) => setCursor({ line, column }),
    [],
  );
  const onSave = useCallback(() => {
    setPanel("changes");
    setNotice("Changes are kept here until you commit them.");
  }, []);

  const isDefault = branch === repository?.defaultBranch;
  // Hosted repositories protect their default branch: commits go to a new one.
  const mustBranch = source === "hosted" && isDefault;
  const commit = () => {
    const problem =
      commitMessage.trim().length < 3
        ? "Write a commit message (at least 3 characters)."
        : (useNewBranch || mustBranch) && branchProblem(newBranch.trim());
    if (problem) return setError({ text: problem });
    void run("Committing", async () => {
      const result = await editorApi.commit(csrf, {
        source,
        repo,
        branch,
        expectedHead: head,
        ...(useNewBranch || mustBranch ? { newBranch: newBranch.trim() } : {}),
        message: commitMessage.trim(),
        changes: [...changes.keys()].map((path) => ({
          path,
          content: edits.get(path) ?? null,
        })),
      });
      const list = (await editorApi.branches(source, repo)).branches;
      setBranches(list);
      setBranch(result.branch);
      const nextTree = await editorApi.tree(source, repo, result.branch);
      resetWork();
      setTree(nextTree);
      const toBranch =
        source === "github" && result.branch !== repository?.defaultBranch;
      if (toBranch) setPrTitle(commitMessage.trim());
      setOfferPr(toBranch);
      setCommitMessage("");
      setUseNewBranch(false);
      setNewBranch("");
      setNotice(
        `${result.message} on ${result.branch} (${result.head.slice(0, 7)}).`,
      );
    });
  };
  const addRepository = (r: EditorRepository) =>
    setRepos((list) =>
      list.some((x) => x.id === r.id)
        ? list.map((x) => (x.id === r.id ? r : x))
        : [r, ...list],
    );
  const openRepository = () => {
    const name = parseRepository(openName);
    if (!name)
      return setError({
        text: "Enter a repository as owner/name or paste its GitHub address.",
      });
    guard(
      () =>
        void run("Opening repository", async () => {
          const { repository: r } = await editorApi.repository(name);
          addRepository(r);
          setRepo(r.id);
          setOpenForm(false);
          setOpenName("");
          setNotice(
            r.canWrite
              ? `Opened ${r.name}.`
              : `Opened ${r.name} (read only). Fork it to edit.`,
          );
        }),
    );
  };
  const fork = () =>
    guard(
      () =>
        void run("Forking", async () => {
          const result = await editorApi.fork(csrf, repo);
          addRepository(result.repository);
          setRepo(result.repository.id);
          setNotice(result.message);
        }),
    );
  const createBranch = () => {
    const name = newBranch.trim();
    const problem = branchProblem(name);
    if (problem) return setError({ text: problem });
    void run("Creating branch", async () => {
      await editorApi.branch(csrf, {
        source,
        repo,
        from: branch,
        branch: name,
        expectedHead: head,
      });
      setBranches((await editorApi.branches(source, repo)).branches);
      setBranch(name);
      setNewBranch("");
      setNotice(`Branch ${name} created. Your edits carry over.`);
    });
  };

  if (session.isPending)
    return <p className="p-6 text-sm">Checking sign-in…</p>;
  if (!canAct)
    return (
      <section className="mx-auto max-w-xl space-y-3 p-8">
        <h1 className="text-2xl font-semibold">Code editor</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to edit your GitHub and ProofStack repositories in the
          browser.
        </p>
        <Button asChild>
          <Link href="/auth?next=%2Fcode">Sign in</Link>
        </Button>
      </section>
    );

  const connect = () =>
    run("Connecting", async () => {
      const { authorizeUrl } = await editorApi.connectGithub(csrf);
      window.location.assign(authorizeUrl);
    });
  const sourceBody = () => {
    if (!sources) return null;
    if (source === "github" && !sources.github.available)
      return "GitHub editing is not available yet.";
    if (source === "hosted" && !sources.hosted.available)
      return "ProofStack-hosted repositories are not available yet. Use GitHub for now.";
    if (source === "github" && !sources.github.connected)
      return (
        <div className="max-w-md space-y-3 text-left">
          <p className="font-medium">Connect GitHub</p>
          <p className="text-muted-foreground">
            ProofStack asks GitHub for access to your repositories so you can
            edit and commit here. Your GitHub token stays on our server,
            encrypted, and is never sent to your browser. You can disconnect at
            any time.
          </p>
          <Button onClick={() => void connect()} disabled={!!busy}>
            Connect GitHub
          </Button>
        </div>
      );
    if (!repos.length && !busy) return "No repositories you can open yet.";
    return null;
  };
  const blocker = sourceBody();

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col border-b bg-background text-sm lg:h-[calc(100dvh-4rem)]">
      {/* Title bar: where you are editing. */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <span className="font-semibold">Code editor</span>
        {sources?.hosted.available && (
          <div
            role="tablist"
            aria-label="Source"
            className="flex rounded border p-0.5"
          >
            {(["github", "hosted"] as const).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={source === s}
                onClick={() =>
                  guard(() => {
                    setSource(s);
                    setRepos([]);
                    setRepo("");
                    setTree(null);
                  })
                }
                className={`rounded px-2 py-0.5 text-xs ${source === s ? "bg-muted font-medium" : "text-muted-foreground"}`}
              >
                {SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
        )}
        {!!repos.length && (
          <select
            aria-label="Repository"
            className={`${selectCls} max-w-[16rem]`}
            value={repo}
            onChange={(e) => {
              const next = e.target.value;
              guard(() => setRepo(next));
            }}
          >
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.canWrite ? "" : " (read only)"}
              </option>
            ))}
          </select>
        )}
        {source === "github" &&
          sources?.github.connected &&
          (openForm ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                openRepository();
              }}
            >
              <input
                aria-label="Repository to open"
                value={openName}
                onChange={(e) => setOpenName(e.target.value)}
                placeholder="owner/name or GitHub address"
                className="h-8 w-60 rounded border bg-background px-2 font-mono text-xs"
                autoFocus
              />
              <Button
                size="sm"
                type="submit"
                disabled={!!busy || !openName.trim()}
              >
                Open
              </Button>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => setOpenForm(false)}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setOpenForm(true)}
            >
              Open repository
            </Button>
          ))}
        {!!branches.length && (
          <select
            aria-label="Branch"
            className={`${selectCls} max-w-[12rem]`}
            value={branch}
            onChange={(e) => {
              const next = e.target.value;
              guard(() => {
                resetWork();
                setBranch(next);
                void loadTree(next);
              });
            }}
          >
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        {!!repo && (
          <button
            type="button"
            className="rounded p-1 hover:bg-muted"
            aria-label="Reload files"
            title="Reload files"
            onClick={() => void loadTree(branch)}
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {busy && (
            <span className="flex items-center gap-1" role="status">
              <Loader2
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin"
              />
              {busy}…
            </span>
          )}
          {source === "github" && sources?.github.connected && (
            <>
              <span>GitHub: {sources.github.login}</span>
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() =>
                  guard(
                    () =>
                      void run("Disconnecting", async () => {
                        await editorApi.disconnectGithub(csrf);
                        setSources(await editorApi.sources());
                        setRepos([]);
                        setRepo("");
                        setTree(null);
                      }),
                  )
                }
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
      {(error || notice || pending) && (
        <div className="border-b px-3 py-2 text-xs" role="status">
          {pending ? (
            <span className="flex flex-wrap items-center gap-2">
              You have uncommitted changes. Discard them?
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  const action = pending;
                  setPending(null);
                  resetWork();
                  action();
                }}
              >
                Discard changes
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPending(null)}
              >
                Keep editing
              </Button>
            </span>
          ) : error ? (
            <span className="flex flex-wrap items-center gap-2 text-red-600 dark:text-red-400">
              {error.text}
              {error.code === "BRANCH_MOVED" && (
                <button
                  type="button"
                  className="underline"
                  onClick={() => void loadTree(branch)}
                >
                  Reload branch (your edits stay)
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setError(null)}
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              {notice}
              {offerPr && (
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setOfferPr(false);
                    setPanel("pulls");
                  }}
                >
                  Open a pull request
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => {
                  setNotice(null);
                  setOfferPr(false);
                }}
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
      )}
      {source === "github" && repository && !repository.canWrite && (
        <div
          className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs"
          role="status"
        >
          You can read {repository.name} but not change it. Fork it to your
          GitHub account to edit and open a pull request.
          <Button size="sm" variant="outline" disabled={!!busy} onClick={fork}>
            <GitFork aria-hidden="true" className="h-3.5 w-3.5" />
            Fork to {sources?.github.login}
          </Button>
        </div>
      )}
      {blocker ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
          {blocker}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Activity bar */}
          <nav
            aria-label="Workbench views"
            className="flex w-11 shrink-0 flex-col items-center gap-1 border-r py-2"
          >
            {(
              [
                ["explorer", Files, "Explorer"],
                ["changes", GitCommitHorizontal, "Source control"],
                ["pulls", GitPullRequest, "Pull requests"],
              ] as const
            )
              // Hosted repositories review changes on their own pages.
              .filter(([key]) => key !== "pulls" || source === "github")
              .map(([key, Icon, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  aria-pressed={panel === key}
                  title={label}
                  onClick={() => setPanel(key)}
                  className={`relative rounded p-2 ${panel === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                  {key === "changes" && changes.size > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 rounded-full bg-accent px-1 font-mono text-[10px] text-accent-foreground">
                      {changes.size}
                    </span>
                  )}
                </button>
              ))}
          </nav>
          {/* Side panel */}
          <aside className="w-60 shrink-0 overflow-hidden border-r max-md:w-48">
            {panel === "explorer" ? (
              <FileTree
                paths={filePaths}
                changes={changes}
                active={active}
                readOnly={readOnly}
                onOpen={open}
                onCreate={(path) => {
                  setEdits((m) => new Map(m).set(path, ""));
                  setTabs((t) => [...t, path]);
                  setActive(path);
                }}
                onDelete={(path) => {
                  setEdits((m) => {
                    const next = new Map(m);
                    if (tree?.files.some((f) => f.path === path))
                      next.set(path, null);
                    else next.delete(path);
                    return next;
                  });
                  close(path);
                }}
              />
            ) : panel === "pulls" && repository ? (
              <PullPanel
                key={repository.id}
                csrf={csrf}
                repository={repository}
                branch={branch}
                branches={branches}
                initialTitle={prTitle}
                busy={!!busy}
                run={run}
                onNotice={setNotice}
              />
            ) : (
              <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-[13px]">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Source control
                </span>
                {changes.size ? (
                  <ul className="space-y-1" aria-label="Changed files">
                    {[...changes].map(([path, kind]) => (
                      <li key={path} className="flex items-center gap-2">
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left hover:underline"
                          onClick={() => kind !== "deleted" && open(path)}
                        >
                          {path}
                        </button>
                        <span className="font-mono text-[10px] uppercase">
                          {kind[0]}
                        </span>
                        <button
                          type="button"
                          aria-label={`Discard changes to ${path}`}
                          title="Discard"
                          onClick={() =>
                            setEdits((m) => {
                              const next = new Map(m);
                              next.delete(path);
                              return next;
                            })
                          }
                        >
                          <X aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No changes yet.</p>
                )}
                <label className="space-y-1">
                  <span className="text-xs">Commit message</span>
                  <textarea
                    value={commitMessage}
                    onChange={(e) =>
                      setCommitMessage(e.target.value.replace(/\n/g, " "))
                    }
                    rows={3}
                    maxLength={200}
                    className="w-full rounded border bg-background px-2 py-1 text-xs"
                    placeholder="Describe your change"
                  />
                </label>
                {!mustBranch && (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={useNewBranch}
                      onChange={(e) => setUseNewBranch(e.target.checked)}
                    />
                    Commit to a new branch
                  </label>
                )}
                {(useNewBranch || mustBranch) && (
                  <label className="space-y-1">
                    <span className="text-xs">
                      {mustBranch
                        ? "The default branch is protected. New branch name"
                        : "New branch name"}
                    </span>
                    <input
                      value={newBranch}
                      onChange={(e) => setNewBranch(e.target.value)}
                      placeholder="feature/my-change"
                      className="w-full rounded border bg-background px-2 py-1 font-mono text-xs"
                    />
                  </label>
                )}
                {source === "github" && isDefault && !useNewBranch && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    This commits directly to {branch}.
                  </p>
                )}
                <Button
                  size="sm"
                  disabled={!changes.size || !!busy || readOnly}
                  onClick={commit}
                >
                  Commit {changes.size || ""} file
                  {changes.size === 1 ? "" : "s"}
                </Button>
                <div className="space-y-1 border-t pt-3">
                  <span className="text-xs">Create a branch from {branch}</span>
                  <div className="flex gap-1">
                    <input
                      value={newBranch}
                      onChange={(e) => setNewBranch(e.target.value)}
                      placeholder="feature/name"
                      aria-label="New branch name"
                      className="min-w-0 flex-1 rounded border bg-background px-2 py-1 font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy || readOnly || !newBranch.trim()}
                      onClick={createBranch}
                    >
                      <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
                      Create
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </aside>
          {/* Editor group */}
          <main className="flex min-w-0 flex-1 flex-col" aria-label="Editor">
            <div
              role="tablist"
              aria-label="Open files"
              className="flex overflow-x-auto border-b bg-muted/30"
            >
              {tabs.map((path, i) => (
                <div
                  key={path}
                  className={`flex shrink-0 items-center gap-1 border-r px-3 py-1.5 text-xs ${active === path ? "bg-background font-medium" : "text-muted-foreground"}`}
                >
                  <button
                    type="button"
                    {...tabProps(active === path)}
                    title={path}
                    onClick={() => setActive(path)}
                    onKeyDown={(e) =>
                      onTabKeyDown(e, i, tabs.length, (n) =>
                        setActive(tabs[n]!),
                      )
                    }
                  >
                    {path.split("/").at(-1)}
                    {changes.has(path) && (
                      <span aria-label="modified" className="ml-1">
                        ●
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${path}`}
                    onClick={() => close(path)}
                    className="rounded hover:bg-muted"
                  >
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {!active ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {repository ? repository.name : "Open a repository"}
                  </p>
                  <p>Pick a file in the Explorer, or create a new one.</p>
                  <p className="text-xs">
                    Ctrl/⌘ + F to search · Ctrl/⌘ + S to review changes
                  </p>
                </div>
              ) : activeLoading ? (
                <p className="p-4 text-muted-foreground">Opening…</p>
              ) : !activeIsNew && activeFile && !activeFile.editable ? (
                <p className="p-4 text-muted-foreground">
                  This file is binary or larger than 1 MiB, so it cannot be
                  edited here.
                </p>
              ) : (
                <EditorPane
                  path={active}
                  value={contentOf(active)}
                  readOnly={!activeEditable}
                  onChange={(value) =>
                    setEdits((m) => new Map(m).set(active, value))
                  }
                  onCursor={onCursor}
                  onSave={onSave}
                />
              )}
            </div>
          </main>
        </div>
      )}
      {/* Status bar */}
      <footer className="flex flex-wrap items-center gap-3 border-t bg-muted/40 px-3 py-1 font-mono text-[11px] text-muted-foreground">
        <span>{SOURCE_LABEL[source]}</span>
        {branch && (
          <span className="flex items-center gap-1">
            <GitBranch aria-hidden="true" className="h-3 w-3" />
            {branch}
            {head && ` @ ${head.slice(0, 7)}`}
          </span>
        )}
        {readOnly && repository && <span>read only</span>}
        {tree?.truncated && <span>large repository: some files hidden</span>}
        <span>{changes.size} changed</span>
        {active && (
          <span className="ml-auto">
            Ln {cursor.line}, Col {cursor.column} · {languageName(active)}
          </span>
        )}
      </footer>
    </div>
  );
}
