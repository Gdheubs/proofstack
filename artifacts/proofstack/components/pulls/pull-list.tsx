"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGetPulls } from "@workspace/api-client-react";
import { PageHead, QueryError, Empty } from "@/components/community/ui";
import {
  card,
  field,
  Field,
  values,
  val,
  Pager,
  Select,
} from "@/components/careers/shared";
import { ActionForm } from "@/components/repositories/action-form";
import { usePullRun } from "@/hooks/use-pulls";
export function PullList({ repositoryId }: { repositoryId: string }) {
  const [offset, setOffset] = useState(0),
    [status, setStatus] = useState("all");
  const q = useGetPulls({ repositoryId, status, offset });
  const a = usePullRun();
  const router = useRouter();
  if (q.isPending) return <p>Loading pull requests…</p>;
  if (q.error)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return null;
  return (
    <>
      <PageHead eyebrow={d.repository.title} title="Pull requests">
        <Link className="underline" href={`/repositories/${repositoryId}`}>
          Source
        </Link>
        <Link
          className="underline"
          href={`/repositories/${repositoryId}/releases`}
        >
          Releases
        </Link>
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="space-y-4">
          <label className="block text-sm">
            Filter
            <select
              value={status}
              className={field + " mt-1 max-w-48"}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              {["all", "open", "draft", "closed", "merged"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {d.pulls.map((p) => (
            <Link
              href={`/pulls/${p.id}`}
              className={card + " block hover:border-primary"}
              key={p.id}
            >
              <div className="flex justify-between gap-3">
                <h2 className="font-semibold">
                  #{p.number} {p.title}
                </h2>
                <span className="text-xs uppercase text-muted-foreground">
                  {p.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {p.authorName} · {p.sourceBranch} → {p.targetBranch}
              </p>
              <p className="line-clamp-2 text-sm">{p.body}</p>
            </Link>
          ))}
          {!d.pulls.length && (
            <Empty
              title="No pull requests here yet"
              body="Commit changes on a working branch, then propose them for review."
            />
          )}
          <Pager offset={offset} more={d.hasMore} change={setOffset} />
        </section>
        <aside>
          {d.repository.canWrite ? (
            <form
              className={card}
              onSubmit={async (e) => {
                const f = values(e);
                const r = await a.run({
                  action: "open",
                  repositoryId,
                  title: val(f, "title"),
                  body: val(f, "body"),
                  sourceBranch: val(f, "source"),
                  targetBranch: val(f, "target"),
                  draft: f.has("draft"),
                  issueId: val(f, "issue") || null,
                });
                if (r) router.push(`/pulls/${r.id}`);
              }}
            >
              <h2 className="text-xl font-semibold">Propose a change</h2>
              <ActionForm action={a} label="Create pull request">
                <Field name="title" label="Title" required />
                <Field
                  name="body"
                  label="What changed, why, and how was it tested?"
                  area
                  max={8000}
                />
                <Select
                  label="Source branch"
                  name="source"
                  items={d.branches.map((b) => b.name)}
                  value={
                    d.branches.find(
                      (b) => b.name !== d.repository.defaultBranch,
                    )?.name
                  }
                />
                <Select
                  label="Target branch"
                  name="target"
                  items={d.branches.map((b) => b.name)}
                  value={d.repository.defaultBranch}
                />
                <label className="block text-sm">
                  Linked project task
                  <select name="issue" className={field + " mt-1"}>
                    <option value="">None</option>
                    {d.issues.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="draft" />
                  Start as a draft
                </label>
                <p className="text-xs text-muted-foreground">
                  Merges need approval from another current contributor, a
                  passing patch check, and manager MFA. A linked task closes
                  when merged into the default branch.
                </p>
              </ActionForm>
            </form>
          ) : (
            <Empty
              title="Review the work"
              body="Join the project as an accepted contributor to propose changes or submit a review."
            />
          )}
        </aside>
      </div>
    </>
  );
}
