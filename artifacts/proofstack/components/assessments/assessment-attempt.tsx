"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCsrf } from "../../hooks/use-community";
import {
  createAssessmentActionGuard,
  getAssessmentAttempt,
  hasAllAnswers,
  submitAssessment,
  type AssessmentAnswers,
  type AssessmentAttempt,
} from "./assessment-api";
import {
  AssessmentMethodology,
  AssessmentQuestions,
  AssessmentResultsContent,
  secondaryActionClass,
} from "./assessment-panels";

function AttemptWorkspace({
  attempt,
  csrf,
  onCompleted,
  onReload,
}: {
  attempt: AssessmentAttempt;
  csrf: string;
  onCompleted: (completed: AssessmentAttempt) => void;
  onReload: () => void;
}) {
  const [answers, setAnswers] = useState<AssessmentAnswers>({});
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useRef(createAssessmentActionGuard());
  async function submit() {
    if (!hasAllAnswers(attempt.questions, answers)) return;
    await guard.current.run(async () => {
      setPending(true);
      setError(null);
      try {
        onCompleted(await submitAssessment(attempt, answers, csrf));
      } catch (problem) {
        setError(
          problem instanceof Error
            ? problem.message
            : "Could not confirm your result. Reload the attempt status before trying again.",
        );
      } finally {
        setPending(false);
      }
    });
  }
  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Your attempt is stored on the server. Unsubmitted answer selections stay
        in this tab only; reloading clears those selections.
      </p>
      {error && (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-destructive/40 p-4"
        >
          <p className="text-sm text-destructive">{error}</p>
          <p className="text-xs text-muted-foreground">
            If submission reached the server, reloading the status will show
            your saved result without submitting again.
          </p>
          <button
            type="button"
            className={secondaryActionClass}
            disabled={pending}
            onClick={onReload}
          >
            Reload attempt status
          </button>
        </div>
      )}
      <AssessmentQuestions
        attempt={attempt}
        index={index}
        answers={answers}
        pending={pending}
        canSubmit={!!csrf}
        onAnswer={(questionId, optionId) =>
          setAnswers((current) => ({ ...current, [questionId]: optionId }))
        }
        onNavigate={setIndex}
        onSubmit={submit}
      />
    </div>
  );
}

export function AssessmentAttemptView({ id }: { id: string }) {
  const { csrf, canAct, session } = useCsrf();
  const client = useQueryClient();
  const userId = session.data?.user?.id;
  const key = ["assessment-attempt", userId, id];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getAssessmentAttempt(id, signal),
    enabled: canAct,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  if (session.isPending) return <p role="status">Checking sign-in…</p>;
  if (session.isError)
    return (
      <div role="alert" className="space-y-3">
        <p>Your sign-in status could not be checked.</p>
        <button
          type="button"
          className={secondaryActionClass}
          onClick={() => session.refetch()}
        >
          Retry sign-in status
        </button>
      </div>
    );
  if (!canAct)
    return (
      <section className="space-y-4 rounded-lg border bg-card p-6">
        <h1 className="font-serif text-3xl">Sign in to continue your check</h1>
        <p className="text-sm text-muted-foreground">
          {session.data?.mfaRequired
            ? "Complete sign-in to access this attempt."
            : "Attempts belong to the account that started them. Sign in with that account to continue."}
        </p>
        <Link
          className={secondaryActionClass}
          href={`/auth?next=${encodeURIComponent(`/assessments/${id}`)}`}
        >
          Sign in
        </Link>
      </section>
    );
  if (query.isPending)
    return (
      <p
        role="status"
        className="rounded-lg border bg-card p-6 text-sm text-muted-foreground"
      >
        Loading your attempt…
      </p>
    );
  if (query.isError)
    return (
      <section role="alert" className="space-y-4 rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-semibold">This attempt could not load</h1>
        <p className="text-sm text-destructive">{query.error.message}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={secondaryActionClass}
            onClick={() => query.refetch()}
          >
            Reload attempt
          </button>
          <Link href="/assessments" className={secondaryActionClass}>
            Back to skill checks
          </Link>
        </div>
      </section>
    );
  const attempt = query.data;
  const completed = attempt.status === "completed";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/assessments"
        className="inline-block text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ← All skill checks
      </Link>
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {attempt.skill} /{" "}
          {completed ? "Saved result" : "Foundation knowledge"}
        </p>
        <h1 className="font-serif text-3xl leading-tight sm:text-4xl">
          {completed ? "Check completed" : attempt.title}
        </h1>
        {!completed && <AssessmentMethodology />}
      </header>
      {completed ? (
        attempt.result ? (
          <>
            <AssessmentResultsContent
              results={[attempt.result]}
              onRetry={() => query.refetch()}
            />
            <Link href="/profile/me" className={secondaryActionClass}>
              View results on your profile
            </Link>
          </>
        ) : (
          <div role="alert" className="space-y-3 rounded-lg border p-5">
            <p>
              This check is completed, but its saved result is unavailable.
              Reload to check again.
            </p>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => query.refetch()}
            >
              Reload result
            </button>
          </div>
        )
      ) : (
        <AttemptWorkspace
          key={`${userId}:${id}`}
          attempt={attempt}
          csrf={csrf}
          onReload={() => query.refetch()}
          onCompleted={(saved) => {
            client.setQueryData(key, saved);
            void client.invalidateQueries({ queryKey: ["assessment-results"] });
          }}
        />
      )}
    </div>
  );
}
