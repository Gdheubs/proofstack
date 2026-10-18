"use client";
import Link from "next/link";
import { useState } from "react";
import { useGetPulls } from "@workspace/api-client-react";
import { PageHead, QueryError, Empty } from "@/features/community/ui";
import { card, Field, values, val, Pager } from "@/features/careers/shared";
import { ActionForm } from "@/features/repositories/action-form";
import { usePullRun } from "@/hooks/use-pulls";
import { RepositoryNavigation } from "../repositories/repository-navigation";
export function Releases({ repositoryId }: { repositoryId: string }) {
  const [offset, setOffset] = useState(0);
  const q = useGetPulls({ repositoryId, view: "releases", offset });
  const a = usePullRun();
  if (q.isPending) return <p>Loading releases…</p>;
  if (q.error) return <QueryError error={q.error} />;
  const d = q.data;
  if (!d) return null;
  const main = d.branches.find((b) => b.name === d.repository.defaultBranch);
  return (
    <>
      <PageHead eyebrow={d.repository.title} title="Releases" />
      <RepositoryNavigation
        repositoryId={repositoryId}
        canManage={d.repository.canManage}
        active="releases"
      />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="space-y-4">
          {d.releases.map((r) => (
            <article className={card} key={r.id}>
              <p className="font-mono text-xs text-primary">{r.tag}</p>
              <h2 className="text-xl font-semibold">{r.title}</h2>
              <p className="whitespace-pre-wrap text-sm">{r.notes}</p>
              <p className="text-xs text-muted-foreground">
                {r.authorName} · {new Date(r.createdAt).toLocaleString()}
              </p>
              <Link
                className="font-mono text-xs underline"
                href={`/repositories/${repositoryId}?branch=${encodeURIComponent(d.repository.defaultBranch)}&revision=${r.commit}`}
              >
                {r.commit.slice(0, 12)} · Browse released source
              </Link>
            </article>
          ))}
          {!d.releases.length && (
            <Empty
              title="No releases yet"
              body="Merge reviewed work, then publish a version anchored to a default-branch commit."
            />
          )}
          <Pager offset={offset} more={d.hasMore} change={setOffset} />
        </section>
        <aside>
          {d.repository.canManage && main && (
            <form
              className={card}
              onSubmit={async (e) => {
                const f = values(e);
                await a.run({
                  action: "release",
                  repositoryId,
                  commit: val(f, "commit"),
                  tag: val(f, "tag"),
                  title: val(f, "title"),
                  notes: val(f, "notes"),
                });
              }}
            >
              <h2 className="text-xl font-semibold">
                Publish an immutable release
              </h2>
              <ActionForm action={a} label="Publish release">
                <Field
                  name="tag"
                  label="Version tag (for example v1.0.0)"
                  max={80}
                  required
                />
                <Field name="title" label="Release title" required />
                <Field
                  name="commit"
                  label="Default-branch commit SHA"
                  value={main.head}
                  max={40}
                  required
                />
                <Field name="notes" label="Release notes" area max={10000} />
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" required />I understand this release
                  and tag cannot be changed.
                </label>
                <p className="text-xs text-muted-foreground">
                  Requires recent MFA. Publishes release notes and a Git tag.
                  This does not deploy or run the application.
                </p>
              </ActionForm>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
