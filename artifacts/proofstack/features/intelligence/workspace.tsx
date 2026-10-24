"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHead, QueryError, Empty } from "@/features/community/ui";
import { card, field, Pager } from "@/features/careers/shared";
import { ActionForm } from "@/features/repositories/action-form";
import { useIntelligenceRun } from "@/hooks/use-intelligence";
import { IntelligenceGate, useIntelligenceData, kindName } from "./shared";
export function IntelligenceWorkspace() {
  const [offset, setOffset] = useState(0),
    [workplace, setWorkplace] = useState<
      "any" | "remote" | "hybrid" | "onsite"
    >("any");
  const { query: q, session } = useIntelligenceData(undefined, offset),
    a = useIntelligenceRun(),
    router = useRouter();
  const requestKey = useRef("");
  if (!session.data?.authenticated || session.data.mfaRequired)
    return <IntelligenceGate loading={session.isPending} />;
  if (q.isPending) return <p>Loading intelligence…</p>;
  if (q.error)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return null;
  return (
    <>
      <PageHead
        eyebrow="Private by default · Review before acting"
        title="Intelligence workspace"
      >
        <Link href="/career" className="underline">
          Career workspace
        </Link>
        <Link href="/repositories" className="underline">
          Repositories
        </Link>
      </PageHead>
      <p className="mb-6 max-w-3xl text-muted-foreground">
        Find opportunities that share your skills, turn a role’s skill topics
        into a practice plan, and review security hints in projects you manage.
        Results stay private to you.
      </p>
      {!d.enabled && (
        <p role="status" className={card + " mb-5"}>
          New jobs are disabled until the operator configures the intelligence
          worker. Saved results remain available.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Your analysis history</h2>
            <button className="text-sm underline" onClick={() => q.refetch()}>
              Refresh
            </button>
          </div>
          {d.jobs.map((j) => (
            <Link
              key={j.id}
              href={`/intelligence/${j.id}`}
              className={card + " block hover:border-primary"}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-semibold">{kindName(j.kind)}</h3>
                <span className="text-xs uppercase text-muted-foreground">
                  {j.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {new Date(j.createdAt).toLocaleString()} ·{" "}
                {j.reviewedAt ? "Reviewed" : "Awaiting your review"}
              </p>
              {j.commit && (
                <p className="font-mono text-xs">
                  {j.branch} · {j.commit.slice(0, 12)}
                </p>
              )}
            </Link>
          ))}
          {!d.jobs.length && (
            <Empty
              title="Your next step, with context"
              body="Request opportunity matches to start. Open an opportunity to build an optional AI practice plan, or a managed repository to request a security review."
            />
          )}
          <Pager offset={offset} more={d.hasMore} change={setOffset} />
        </section>
        <aside className="space-y-5">
          <form
            className={card}
            onSubmit={async (e) => {
              e.preventDefault();
              requestKey.current ||= crypto.randomUUID();
              const r = await a.run({
                action: "enqueue",
                kind: "opportunities",
                requestKey: requestKey.current,
                workplace,
              });
              if (r) {
                requestKey.current = "";
                router.push(`/intelligence/${r.id}`);
              }
            }}
          >
            <h2 className="text-xl font-semibold">
              Discover your next project or role
            </h2>
            <p className="text-sm text-muted-foreground">
              Matches use your profile skills and public, open opportunities. No
              AI provider is needed.
            </p>
            <ActionForm
              action={a}
              disabled={!d.enabled}
              label="Find opportunities"
            >
              <label className="block text-sm">
                Workplace
                <select
                  className={field + " mt-1"}
                  value={workplace}
                  onChange={(e) => {
                    setWorkplace(e.target.value as typeof workplace);
                    requestKey.current = "";
                  }}
                >
                  <option value="any">Any workplace</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </label>
              <Link
                href="/settings/profile"
                className="block text-sm underline"
              >
                Update my skills
              </Link>
            </ActionForm>
          </form>
          <section className={card}>
            <h2 className="font-semibold">AI practice plans</h2>
            <p className="text-sm text-muted-foreground">
              Choose a suggested opportunity, then request a plan. Only your
              skill labels and that role’s skill labels are sent to the
              configured AI provider, with your consent.
            </p>
            <p className="text-sm">
              {d.aiEnabled
                ? "AI provider configured"
                : "AI provider not configured"}
            </p>
            <Link className="text-sm underline" href="/opportunities">
              Browse opportunities
            </Link>
          </section>
          <section className={card}>
            <h2 className="font-semibold">Usage today</h2>
            <p className="text-sm">
              {d.usedToday} / {d.dailyLimit} jobs · {d.aiUsedToday} /{" "}
              {d.aiDailyLimit} AI plans
            </p>
            <p className="text-xs text-muted-foreground">
              Limits reset at 00:00 UTC. Failed or cancelled requests still
              reserve quota. Completed results are retained for 30 days. At most
              two jobs can be active at once.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
