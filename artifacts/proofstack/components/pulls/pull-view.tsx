"use client";
import Link from "next/link";
import { useGetPulls, getGetPullsQueryKey } from "@workspace/api-client-react";
import { PageHead, QueryError } from "@/components/community/ui";
import { card } from "@/components/careers/shared";
import { Button } from "@/components/ui/button";
import {
  ReviewForm,
  CommentForm,
  MergeForm,
  StateForm,
  CheckForm,
} from "./pull-forms";
export function PullView({ id }: { id: string }) {
  const q = useGetPulls(
    { id },
    {
      query: {
        queryKey: getGetPullsQueryKey({ id }),
        refetchOnWindowFocus: false,
      },
    },
  );
  if (q.isPending) return <p>Loading review…</p>;
  if (q.error)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data,
    p = d?.pull;
  if (!d || !p) return null;
  return (
    <>
      <PageHead
        eyebrow={`${d.repository.title} · ${p.status}`}
        title={`#${p.number} ${p.title}`}
      >
        <Link
          className="underline"
          href={`/repositories/${d.repository.id}/pulls`}
        >
          All pull requests
        </Link>
        <Button variant="outline" onClick={() => q.refetch()}>
          Refresh commits
        </Button>
      </PageHead>
      <p className="mb-6 text-sm text-muted-foreground">
        {p.authorName} proposes {p.sourceBranch} → {p.targetBranch} ·{" "}
        {p.sourceHead.slice(0, 10)} / {p.targetHead.slice(0, 10)}
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <main className="min-w-0 space-y-5">
          <section className={card}>
            <h2 className="font-semibold">Summary</h2>
            <p className="whitespace-pre-wrap text-sm">
              {p.body || "No description provided."}
            </p>
            {p.issueId && (
              <Link
                className="text-sm underline"
                href={`/work/${d.repository.projectId}`}
              >
                View linked task on the work board
              </Link>
            )}
            {p.mergeHead && (
              <p className="text-xs">
                Merged as{" "}
                <Link
                  className="font-mono underline"
                  href={`/repositories/${d.repository.id}?branch=${encodeURIComponent(p.targetBranch)}&revision=${p.mergeHead}`}
                >
                  {p.mergeHead.slice(0, 12)}
                </Link>
              </p>
            )}
          </section>
          <section className={card}>
            <h2 className="font-semibold">
              Changed files ({d.files.length}
              {d.patchTruncated ? "+" : ""})
            </h2>
            <ul className="max-h-56 space-y-1 overflow-auto font-mono text-xs">
              {d.files.map((f) => (
                <li key={f.path}>
                  {f.status} {f.path}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              The diff shows changes from the branches’ common ancestor.
              Approval is bound to both displayed commit IDs.
            </p>
          </section>
          <section className="overflow-hidden rounded-xl border bg-card">
            <h2 className="border-b p-4 font-semibold">Patch</h2>
            {d.patchTruncated ? (
              <p className="p-4 text-sm">
                This patch exceeds the browser limit. Clone the repository and
                review the full diff locally before approving.
              </p>
            ) : (
              <pre className="max-h-[44rem] overflow-auto p-4 font-mono text-xs leading-6">
                <code>{d.patch || "No file differences."}</code>
              </pre>
            )}
          </section>
          <section className={card}>
            <h2 className="text-xl font-semibold">Review history</h2>
            {!d.reviews.length && (
              <p className="text-sm text-muted-foreground">
                Waiting for an independent contributor review.
              </p>
            )}
            {d.reviews.map((r) => (
              <article key={r.id} className="border-t pt-3">
                <p className="text-sm font-medium">
                  {r.reviewerName} · {r.decision}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({r.current ? "current" : "stale or superseded"})
                  </span>
                </p>
                <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {r.sourceHead.slice(0, 10)} / {r.targetHead.slice(0, 10)}
                </p>
              </article>
            ))}
            <p className="text-xs text-muted-foreground">
              Latest 100 reviews shown. Merge eligibility uses each currently
              authorized reviewer’s latest decision.
            </p>
          </section>
          <section className={card}>
            <h2 className="text-xl font-semibold">Discussion</h2>
            {d.comments.map((c) => (
              <article key={c.id} className="rounded bg-muted p-3">
                <p className="text-xs font-semibold">
                  {c.authorName} · {new Date(c.createdAt).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {c.body}
                </p>
              </article>
            ))}
            {!d.comments.length && (
              <p className="text-sm text-muted-foreground">
                Use comments for questions, context, and follow-up work.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Showing the latest 100 comments.
            </p>
          </section>
          {d.repository.canWrite && <CommentForm id={id} />}
        </main>
        <aside className="space-y-5">
          <section className={card}>
            <h2 className="font-semibold">Merge requirements</h2>
            <ul className="space-y-2 text-sm">
              <li>Independent current approvals: {d.approvalCount}</li>
              <li>
                Current changes requested: {d.changesRequested ? "yes" : "none"}
              </li>
              <li>Patch check: {d.check.status}</li>
              <li>Conflict detection: performed when merging</li>
            </ul>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {d.check.details}
            </pre>
            {p.status === "open" && d.repository.canWrite && (
              <CheckForm data={d} />
            )}
          </section>
          {p.canReview && (
            <ReviewForm key={p.sourceHead + p.targetHead} data={d} />
          )}{" "}
          {d.canMerge && (
            <MergeForm key={p.sourceHead + p.targetHead} data={d} />
          )}{" "}
          {p.status === "open" && d.repository.canManage && !d.canMerge && (
            <p className={card + " text-sm text-muted-foreground"}>
              Merge is blocked until the current review and patch-check
              requirements are met.
            </p>
          )}
          {(p.isAuthor || p.canManage) && p.status !== "merged" && (
            <StateForm data={d} />
          )}
          <Link
            className="block text-sm underline"
            href={`/repositories/${d.repository.id}`}
          >
            Browse repository source →
          </Link>
        </aside>
      </div>
    </>
  );
}
