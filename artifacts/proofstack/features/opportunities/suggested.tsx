"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, QueryError } from "@/features/community/ui";
import { card, field, Pager } from "@/features/careers/shared";
import { ActionForm } from "@/features/repositories/action-form";
import { useIntelligenceRun } from "@/hooks/use-intelligence";
import {
  IntelligenceGate,
  useIntelligenceData,
} from "@/features/intelligence/shared";
import { IntelligenceResults } from "@/features/intelligence/results";
import { JobAlertCta } from "./job-alert-cta";
import { OpportunitiesShell } from "./shell";

// Opportunity matches: the latest run's results, a form for a new run, and
// the history of runs. Everything here is private to the member.
export function SuggestedView() {
  const [offset, setOffset] = useState(0);
  const [workplace, setWorkplace] = useState<
    "any" | "remote" | "hybrid" | "onsite"
  >("any");
  const { query: history, session } = useIntelligenceData(
    undefined,
    offset,
    "opportunities",
  );
  const latest = history.data?.jobs.find((j) => j.status === "succeeded");
  const { query: detail } = useIntelligenceData(latest?.id);
  const a = useIntelligenceRun();
  const requestKey = useRef("");
  const body = () => {
    if (!session.data?.authenticated || session.data.mfaRequired)
      return <IntelligenceGate loading={session.isPending} />;
    if (history.isPending) return <p>Loading your matches…</p>;
    if (history.error)
      return (
        <QueryError error={history.error} onRetry={() => history.refetch()} />
      );
    const d = history.data;
    if (!d) return null;
    const running = d.jobs.some((j) =>
      ["queued", "running"].includes(j.status),
    );
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-4" aria-live="polite">
          {running && (
            <p role="status" className={card}>
              Finding opportunities that share your skills… this page refreshes
              on its own.
            </p>
          )}
          {latest && detail.data?.job ? (
            <>
              <p className="text-xs text-muted-foreground">
                Run {new Date(latest.createdAt).toLocaleString()} ·{" "}
                <Link
                  href={`/intelligence/${latest.id}`}
                  className="underline underline-offset-2"
                >
                  Open this run
                </Link>
              </p>
              <IntelligenceResults job={detail.data.job} />
            </>
          ) : latest ? (
            <p>Loading the latest run…</p>
          ) : (
            !running && (
              <Empty
                title="No matches yet"
                body="Run a search: it compares the skills on your profile with open opportunities. Nothing leaves ProofStack, and results stay private to you."
                action={<JobAlertCta />}
              />
            )
          )}
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
              if (r) requestKey.current = "";
            }}
          >
            <h2 className="text-lg font-semibold">Find matches</h2>
            <p className="text-sm text-muted-foreground">
              Uses the skills on your profile and public, open opportunities.
            </p>
            <ActionForm
              action={a}
              disabled={!d.enabled || running}
              label={running ? "Searching…" : "Find opportunities"}
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
            {!d.enabled && (
              <p className="text-xs text-muted-foreground">
                New searches are paused right now. Saved results stay available.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {d.usedToday} of {d.dailyLimit} searches used today (resets 00:00
              UTC).
            </p>
          </form>
          {d.jobs.length > 0 && (
            <section className={card}>
              <h2 className="font-semibold">Earlier runs</h2>
              <ul className="space-y-2 text-sm">
                {d.jobs.map((j) => (
                  <li key={j.id} className="flex justify-between gap-2">
                    <Link
                      href={`/intelligence/${j.id}`}
                      className="underline underline-offset-2"
                    >
                      {new Date(j.createdAt).toLocaleString()}
                    </Link>
                    <span className="text-xs uppercase text-muted-foreground">
                      {j.status}
                    </span>
                  </li>
                ))}
              </ul>
              <Pager offset={offset} more={d.hasMore} change={setOffset} />
            </section>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/opportunities">Browse all opportunities</Link>
          </Button>
        </aside>
      </div>
    );
  };
  return (
    <OpportunitiesShell
      title="Suggested for you"
      intro="Open opportunities that share the skills on your profile. A suggestion is a starting point, not a judgment of your abilities."
    >
      {body()}
    </OpportunitiesShell>
  );
}
