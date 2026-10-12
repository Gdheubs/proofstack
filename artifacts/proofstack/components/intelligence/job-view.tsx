"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHead, QueryError } from "@/components/community/ui";
import { card } from "@/components/careers/shared";
import { StepUpDialog } from "@/components/auth/mfa";
import { Button } from "@/components/ui/button";
import { useIntelligenceRun } from "@/hooks/use-intelligence";
import { IntelligenceGate, useIntelligenceData, kindName } from "./shared";
import { IntelligenceResults } from "./results";
export function IntelligenceJobView({ id }: { id: string }) {
  const { query: q, session } = useIntelligenceData(id),
    a = useIntelligenceRun(),
    router = useRouter();
  if (!session.data?.authenticated || session.data.mfaRequired)
    return <IntelligenceGate loading={session.isPending} />;
  if (q.isPending) return <p>Loading analysis…</p>;
  if (q.error)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const job = q.data?.job;
  if (!job) return null;
  const active = ["queued", "running"].includes(job.status);
  return (
    <>
      <StepUpDialog
        open={!!a.stepUp}
        factors={a.factors}
        run={a.raw}
        onSettle={a.settle}
      />
      <PageHead eyebrow="Private analysis" title={kindName(job.kind)}>
        <Link className="underline" href="/intelligence">
          All analyses
        </Link>
        {job.repositoryId && (
          <Link
            className="underline"
            href={`/repositories/${job.repositoryId}/security`}
          >
            New repository scan
          </Link>
        )}
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-5">
          <section className={card} aria-live="polite">
            <h2 className="font-semibold capitalize">{job.status}</h2>
            {active && (
              <p className="text-sm">
                This page refreshes while the worker processes your job. You can
                leave and return using this private URL. Queued work expires
                after 24 hours if no worker completes it.
              </p>
            )}
            {job.error && (
              <p className="text-sm text-destructive">{job.error}</p>
            )}
            {job.commit && (
              <p className="break-all font-mono text-xs">
                {job.branch} · {job.commit}
              </p>
            )}
            <button className="text-sm underline" onClick={() => q.refetch()}>
              Refresh status
            </button>
          </section>
          <IntelligenceResults job={job} />
        </div>
        <aside className="space-y-5">
          <section className={card}>
            <h2 className="font-semibold">Your review</h2>
            <p className="text-sm text-muted-foreground">
              Results do not change your profile, application, repository, or
              hiring decisions. Verify suggestions before acting.
            </p>
            {job.reviewedAt ? (
              <p className="text-sm">
                Reviewed {new Date(job.reviewedAt).toLocaleString()}
              </p>
            ) : (
              job.status === "succeeded" && (
                <Button
                  disabled={a.pending}
                  onClick={() => a.run({ action: "review", id })}
                >
                  Mark as reviewed
                </Button>
              )
            )}
            {active ? (
              <Button
                variant="outline"
                disabled={a.pending}
                onClick={() => a.run({ action: "cancel", id })}
              >
                Cancel job
              </Button>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await a.run({ action: "delete", id }))
                    router.push("/intelligence");
                }}
                className="space-y-3"
              >
                <label className="flex gap-2 text-xs">
                  <input type="checkbox" required />I understand deleting this
                  result cannot be undone.
                </label>
                <Button variant="outline" disabled={a.pending} type="submit">
                  Delete result
                </Button>
              </form>
            )}
            {a.error && (
              <p role="alert" className="text-sm text-destructive">
                {a.error}
              </p>
            )}
          </section>
          <section className={card}>
            <h2 className="font-semibold">Run details</h2>
            <p className="text-xs text-muted-foreground">
              Created {new Date(job.createdAt).toLocaleString()} · Attempt{" "}
              {job.attempts}
            </p>
            {job.model && (
              <>
                <p className="break-all text-sm">Model: {job.model}</p>
                <p className="text-sm">
                  Input tokens: {job.promptTokens ?? "unknown"} · Output tokens:{" "}
                  {job.completionTokens ?? "unknown"}
                </p>
                <p className="text-sm">
                  {job.estimatedCostMicros === null
                    ? "Cost estimate unavailable; consult provider usage."
                    : `Estimated cost: $${(job.estimatedCostMicros / 1000000).toFixed(6)} USD`}
                </p>
                <p className="text-xs text-muted-foreground">
                  A timed-out or cancelled provider call may still incur
                  charges. Estimates use operator-configured rates.
                </p>
              </>
            )}
            {job.result && (
              <p className="text-xs">Engine: {job.result.engine}</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
