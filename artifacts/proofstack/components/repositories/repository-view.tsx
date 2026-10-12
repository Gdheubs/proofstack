"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useGetRepositories,
  getGetRepositoriesQueryKey,
} from "@workspace/api-client-react";
import { PageHead, QueryError } from "@/components/community/ui";
import { card, Pager } from "@/components/careers/shared";
import { Button } from "@/components/ui/button";
import { Folder, FileCode, GitBranch, Lock } from "lucide-react";
import { Editor, BranchForm } from "./repository-forms";
import { ClonePanel } from "./clone-panel";
const location = (id: string, branch: string, path = "", revision = "") =>
  `/repositories/${id}?${new URLSearchParams({ branch, ...(path ? { path } : {}), ...(revision ? { revision } : {}) })}`;
export function RepositoryView({
  id,
  branch,
  path = "",
  revision,
}: {
  id: string;
  branch?: string;
  path?: string;
  revision?: string;
}) {
  const [offset, setOffset] = useState(0);
  const params = { id, branch, path, revision, offset };
  const q = useGetRepositories(params, {
    query: {
      queryKey: getGetRepositoriesQueryKey(params),
      refetchOnWindowFocus: false,
    },
  });
  const [editor, setEditor] = useState<"new" | "edit" | null>(null);
  const [branching, setBranching] = useState(false);
  const router = useRouter();
  if (q.isPending) return <p>Loading source…</p>;
  if (q.error)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data,
    r = d?.repositories[0];
  if (!d || !r) return null;
  const current = d.branches.find((b) => b.name === d.branch);
  const historical = d.head !== current?.head;
  const writable = r.canWrite && !historical && d.branch !== r.defaultBranch;
  return (
    <>
      <PageHead eyebrow="Source · Native Git repository" title={r.projectTitle}>
        <Link className="underline" href={`/projects/${r.projectSlug}`}>
          Project →
        </Link>
        <Link className="underline" href={`/repositories/${id}/pulls`}>
          Pull requests
        </Link>
        <Link className="underline" href={`/repositories/${id}/releases`}>
          Releases
        </Link>
        {r.canManage && (
          <Link className="underline" href={`/repositories/${id}/security`}>
            Security review
          </Link>
        )}
        <Link className="underline" href="/repositories">
          Repositories
        </Link>
      </PageHead>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <GitBranch className="h-4 w-4" />
          <span className="sr-only">Branch</span>
          <select
            className="rounded border bg-background p-2"
            value={d.branch}
            onChange={(e) => {
              setEditor(null);
              setOffset(0);
              router.push(location(id, e.target.value));
            }}
          >
            {d.branches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
        </label>
        {d.branch === r.defaultBranch && (
          <span className="flex items-center gap-1 text-xs">
            <Lock className="h-3 w-3" />
            Protected default branch
          </span>
        )}
        <span className="font-mono text-xs text-muted-foreground">
          {d.head.slice(0, 10)}
        </span>
        {r.canWrite && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBranching(!branching)}
          >
            New branch
          </Button>
        )}
        {writable && (
          <Button size="sm" onClick={() => setEditor("new")}>
            New file
          </Button>
        )}
      </div>
      {historical && (
        <p className="mb-5 rounded border p-3 text-sm">
          Viewing a historical commit.{" "}
          <Link className="underline" href={location(id, d.branch)}>
            Return to latest source
          </Link>
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-5">
          {branching && (
            <BranchForm
              data={d}
              onDone={(name) => {
                setBranching(false);
                setEditor(null);
                router.push(location(id, name));
              }}
            />
          )}
          {editor && (
            <Editor
              key={`${editor}-${d.head}-${path}`}
              data={d}
              edit={editor === "edit"}
              onClose={() => setEditor(null)}
            />
          )}
          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
              <nav
                className="flex min-w-0 flex-wrap gap-1 font-mono text-xs"
                aria-label="Source path"
              >
                <Link
                  className="underline"
                  href={location(id, d.branch, "", revision)}
                >
                  root
                </Link>
                {d.folder
                  .split("/")
                  .filter(Boolean)
                  .map((segment, i, parts) => (
                    <span key={i}>
                      {" "}
                      /{" "}
                      <Link
                        className="underline"
                        href={location(
                          id,
                          d.branch,
                          parts.slice(0, i + 1).join("/"),
                          revision,
                        )}
                      >
                        {segment}
                      </Link>
                    </span>
                  ))}
              </nav>
              <span className="text-xs text-muted-foreground">
                {d.entries.length} entries
              </span>
            </div>
            {d.entries.map((e) => (
              <Link
                key={e.path}
                className="flex items-center gap-3 border-b px-4 py-3 text-sm last:border-0 hover:bg-muted/50"
                href={location(id, d.branch, e.path, revision)}
              >
                {e.kind === "directory" ? (
                  <Folder className="h-4 w-4 text-primary" />
                ) : (
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="truncate font-mono">{e.name}</span>
              </Link>
            ))}
          </section>
          {d.file && (
            <section className="overflow-hidden rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                <h2 className="break-all font-mono text-sm">{d.file.path}</h2>
                <span className="text-xs text-muted-foreground">
                  {d.file.size} bytes
                </span>
                {writable && d.file.previewable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditor("edit")}
                  >
                    Edit file
                  </Button>
                )}
              </div>
              {d.file.previewable ? (
                <pre className="max-h-[42rem] overflow-auto p-4 font-mono text-xs leading-6">
                  <code>{d.file.content}</code>
                </pre>
              ) : (
                <p className="p-4 text-sm">
                  This file cannot be previewed. Clone the repository to view it
                  locally.
                </p>
              )}
            </section>
          )}
          <section className={card}>
            <h2 className="text-xl font-semibold">Commit history</h2>
            <ol className="divide-y">
              {d.commits.map((c) => (
                <li key={c.sha} className="py-3">
                  <Link
                    href={location(id, d.branch, "", c.sha)}
                    className="font-medium underline"
                  >
                    {c.message}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.author} · {new Date(c.date).toLocaleString()} ·{" "}
                    <span className="font-mono">{c.sha.slice(0, 10)}</span>
                  </p>
                </li>
              ))}
            </ol>
            <Pager offset={offset} more={d.hasMore} change={setOffset} />
          </section>
        </main>
        <aside className="space-y-5">
          <section className={card}>
            <h2 className="font-semibold">Repository access</h2>
            <p className="text-sm text-muted-foreground">
              Visibility follows this project and its organization. Work on
              separate branches to keep the default branch stable.
            </p>
            <p className="text-xs">
              Storage: {(d.usedBytes / 1024 / 1024).toFixed(2)} /{" "}
              {(r.quotaBytes / 1024 / 1024).toFixed(0)} MiB
            </p>
            <Link className="text-sm underline" href={`/work/${r.projectId}`}>
              Open project work board →
            </Link>
          </section>
          <ClonePanel data={d} />
        </aside>
      </div>
    </>
  );
}
