"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  CheckCircle2,
  Circle,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/features/auth/shared";
import { FeedView } from "@/features/community/feed-view";
import { PersonAvatar } from "@/features/community/ui";
import { editorApi } from "@/features/editor/editor-api";
import { getAssessmentResults } from "@/features/assessments/assessment-api";
import { useCsrf } from "@/hooks/use-community";
import { useViewer } from "@/hooks/use-viewer";

// Profile completeness: what a new member still has to do to be found.
function useSetup() {
  const { viewer } = useViewer();
  const { canAct } = useCsrf();
  const sources = useQuery({
    queryKey: ["editor-sources"],
    queryFn: () => editorApi.sources(),
    enabled: canAct,
    staleTime: 60_000,
    retry: false,
  });
  const results = useQuery({
    queryKey: ["assessment-results", "me", viewer?.id],
    queryFn: ({ signal }) => getAssessmentResults("me", signal),
    enabled: canAct && !!viewer?.handle,
    staleTime: 60_000,
    retry: false,
  });
  const steps = [
    {
      label: "Claim your handle and add a photo",
      done: !!viewer?.handle && !!viewer?.avatarPath,
      href: "/profile/settings",
    },
    {
      label: "List your skills",
      done: (viewer?.skills.length ?? 0) > 0,
      href: "/profile/settings",
    },
    {
      label: "Connect GitHub",
      done: !!sources.data?.github.connected,
      href: "/code",
    },
    {
      label: "Take a skill check",
      done: (results.data?.results.length ?? 0) > 0,
      href: "/assessments",
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, percent: Math.round((done / steps.length) * 100) };
}

export function HomeView() {
  const { viewer, query } = useViewer();
  const { canAct, session } = useCsrf();
  const setup = useSetup();
  if (session.isPending || (canAct && query.isPending))
    return <Skeleton className="mx-auto mt-8 h-64 max-w-6xl" />;
  if (!canAct)
    return (
      <section className="mx-auto max-w-xl space-y-3 p-8 text-center">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to see your feed.
        </p>
        <Button asChild>
          <Link href="/auth?next=%2Fhome">Log in</Link>
        </Button>
      </section>
    );
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-5 lg:grid-cols-[16rem_minmax(0,1fr)_18rem]">
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <PersonAvatar
              person={{
                displayName: viewer?.displayName ?? "?",
                avatarPath: viewer?.avatarPath ?? "",
              }}
              size={48}
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{viewer?.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {viewer?.handle ? `@${viewer.handle}` : "No handle yet"}
              </p>
            </div>
          </div>
          {viewer?.headline && (
            <p className="mt-3 text-sm text-muted-foreground">
              {viewer.headline}
            </p>
          )}
          <Link
            href="/profile/me"
            className="mt-3 inline-block text-sm underline underline-offset-2"
          >
            View your profile
          </Link>
        </section>
        {setup.percent < 100 && (
          <section
            aria-label="Set up your profile"
            className="rounded-xl border bg-card p-4"
          >
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">Profile strength</span>
              <span className="font-mono text-xs">{setup.percent}%</span>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] dark:bg-accent"
                style={{ width: `${setup.percent}%` }}
              />
            </div>
            <ul className="space-y-1.5 text-sm">
              {setup.steps.map((s) => (
                <li key={s.label}>
                  <Link
                    href={s.href}
                    className={`flex items-start gap-2 rounded px-1 py-0.5 hover:bg-muted ${s.done ? "text-muted-foreground line-through" : ""}`}
                  >
                    {s.done ? (
                      <CheckCircle2
                        aria-label="done"
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      />
                    ) : (
                      <Circle
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                    )}
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
      <main className="min-w-0">
        <FeedView embedded />
      </main>
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Next for you
          </h2>
          <ul className="space-y-2 text-sm">
            {[
              [GraduationCap, "Take a skill check", "/assessments"],
              [Briefcase, "Browse open roles", "/opportunities"],
              [Sparkles, "Discover builders", "/talent"],
            ].map(([Icon, label, href]) => {
              const I = Icon as typeof Briefcase;
              return (
                <li key={String(href)}>
                  <Link
                    href={String(href)}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted"
                  >
                    <I
                      aria-hidden="true"
                      className="h-4 w-4 text-primary dark:text-accent"
                    />
                    {String(label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </aside>
    </div>
  );
}
