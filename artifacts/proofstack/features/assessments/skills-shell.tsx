"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardCheck, GraduationCap } from "lucide-react";
import { Empty, QueryError } from "@/features/community/ui";
import { card, Pager } from "@/features/careers/shared";
import { useCsrf } from "@/hooks/use-community";
import { useViewer } from "@/hooks/use-viewer";
import { useIntelligenceData } from "@/features/intelligence/shared";
import { getAssessmentResults } from "./assessment-api";
import { AssessmentResultsContent } from "./assessment-panels";
import { useState } from "react";

// Skills: checks, your results, and AI practice plans, one page each.
export const SKILLS_SECTIONS = [
  { href: "/assessments", label: "Skill checks", icon: ClipboardCheck },
  { href: "/assessments/results", label: "Your results", icon: GraduationCap },
  { href: "/assessments/plans", label: "Practice plans", icon: BookOpen },
] as const;

export function SkillsShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { canAct } = useCsrf();
  return (
    <div className="space-y-6">
      <nav aria-label="Skills sections" className="-mx-1 overflow-x-auto">
        <ul className="flex gap-1 border-b px-1">
          {SKILLS_SECTIONS.filter(
            (s) => canAct || s.href === "/assessments",
          ).map(({ href, label, icon: Icon }) => {
            const active = path === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? "border-primary font-medium text-foreground dark:border-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}

export function MyResultsView() {
  const { canAct, session } = useCsrf();
  const { viewer } = useViewer();
  const results = useQuery({
    queryKey: ["assessment-results", "me", viewer?.id],
    queryFn: ({ signal }) => getAssessmentResults("me", signal),
    enabled: canAct && !!viewer?.handle,
  });
  if (!session.isPending && !canAct)
    return (
      <Empty
        title="Sign in to see your results"
        body="Your skill-check results are listed here and on your profile."
      />
    );
  if (canAct && viewer && !viewer.handle)
    return (
      <Empty
        title="Claim a handle first"
        body="Results are attached to your public profile."
        action={
          <Link href="/settings/profile" className="underline">
            Set up your profile
          </Link>
        }
      />
    );
  return (
    <AssessmentResultsContent
      results={results.data?.results}
      loading={results.isPending || session.isPending}
      error={results.error ?? undefined}
      isMe
      onRetry={() => results.refetch()}
    />
  );
}

// AI practice plans: requested from an opportunity, listed here.
export function PracticePlansView() {
  const [offset, setOffset] = useState(0);
  const { query, session } = useIntelligenceData(
    undefined,
    offset,
    "career-plan",
  );
  if (
    !session.isPending &&
    (!session.data?.authenticated || session.data.mfaRequired)
  )
    return (
      <Empty
        title="Sign in to see your practice plans"
        body="Plans are private to you."
      />
    );
  if (query.isPending || session.isPending)
    return <p>Loading practice plans…</p>;
  if (query.error)
    return <QueryError error={query.error} onRetry={() => query.refetch()} />;
  const d = query.data;
  if (!d) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="space-y-3">
        {d.jobs.length ? (
          d.jobs.map((j) => (
            <Link
              key={j.id}
              href={`/intelligence/${j.id}`}
              className={card + " block hover:border-primary"}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-semibold">
                  {j.result?.summary?.slice(0, 80) || "Practice plan"}
                </h3>
                <span className="text-xs uppercase text-muted-foreground">
                  {j.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {new Date(j.createdAt).toLocaleString()} ·{" "}
                {j.reviewedAt ? "Reviewed" : "Awaiting your review"}
              </p>
            </Link>
          ))
        ) : (
          <Empty
            title="No practice plans yet"
            body="Open an opportunity and choose “Build a learning plan” to turn its skill topics into exercises."
            action={
              <Link href="/opportunities" className="underline">
                Browse opportunities
              </Link>
            }
          />
        )}
        <Pager offset={offset} more={d.hasMore} change={setOffset} />
      </section>
      <aside className={card}>
        <h2 className="font-semibold">How plans work</h2>
        <p className="text-sm text-muted-foreground">
          Only your skill labels and the opportunity’s skill labels are sent to
          the configured AI provider, with your consent each time. Plans never
          change your profile or applications.
        </p>
        <p className="text-sm">
          {d.aiEnabled
            ? "AI plans are available."
            : "AI plans are not available right now."}
        </p>
        <p className="text-xs text-muted-foreground">
          {d.aiUsedToday} of {d.aiDailyLimit} plans used today (resets 00:00
          UTC).
        </p>
      </aside>
    </div>
  );
}
