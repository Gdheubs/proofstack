"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGetRepositories } from "@workspace/api-client-react";
import { PageHead, Empty, QueryError } from "@/features/community/ui";
import { card, field, values, val, Pager } from "@/features/careers/shared";
import { useRepositoryRun } from "@/hooks/use-repository";
import { ActionForm } from "./action-form";
import { GitBranch } from "lucide-react";
export function RepositoryList({ projectId }: { projectId?: string }) {
  const [offset, setOffset] = useState(0);
  const q = useGetRepositories({ projectId, offset });
  const a = useRepositoryRun();
  const router = useRouter();
  if (q.isPending) return <p>Loading repositories…</p>;
  if (q.error)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return null;
  return (
    <>
      <PageHead
        eyebrow="Native Git · Built around projects"
        title="Repositories"
      >
        <Link href="/projects" className="underline">
          Explore projects →
        </Link>
      </PageHead>
      <p className="mb-6 max-w-2xl text-muted-foreground">
        Browse source, create branches, and commit changes together.
        Repositories inherit their project’s visibility and contributor
        permissions.
      </p>
      {!d.enabled && (
        <div className={card + " mb-6"}>
          <h2 className="font-semibold">
            Repository storage is not configured
          </h2>
          <p className="text-sm text-muted-foreground">
            The server needs Git and a private durable repository volume. Follow
            the repository setup guide before enabling this feature.
          </p>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          {d.repositories.map((r) => (
            <Link
              href={`/repositories/${r.id}`}
              className={card + " block hover:border-primary"}
              key={r.id}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{r.projectTitle}</h2>
                <span className="text-xs text-muted-foreground">
                  {r.visibility}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                <GitBranch className="mr-2 inline h-4 w-4" />
                {r.defaultBranch} ·{" "}
                {r.canWrite ? "Contributor access" : "Read access"}
              </p>
            </Link>
          ))}
          {!d.repositories.length && (
            <Empty
              title="Your work deserves a source of truth"
              body="Create a repository for a project you manage to start tracking real commits."
            />
          )}
          <Pager offset={offset} more={d.hasMore} change={setOffset} />
        </section>
        <aside>
          {d.enabled && (
            <form
              className={card}
              onSubmit={async (e) => {
                const f = values(e);
                const r = await a.run({
                  action: "create",
                  projectId: val(f, "project"),
                });
                if (r) router.push(`/repositories/${r.id}`);
              }}
            >
              <h2 className="text-xl font-semibold">Initialize a repository</h2>
              <ActionForm action={a} label="Create with README">
                <label className="block text-sm">
                  Project
                  <select
                    name="project"
                    className={field + " mt-1"}
                    required
                    defaultValue={projectId}
                  >
                    {d.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                {!d.projects.length && (
                  <p className="text-sm text-muted-foreground">
                    Create a project first. Each project supports one
                    repository.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  The main branch is protected. Accepted contributors can create
                  working branches. Git push and code execution are not enabled.
                </p>
              </ActionForm>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
