"use client";

import React from "react";
import Link from "next/link";
import {
  hasAllAnswers,
  type Assessment,
  type AssessmentAttempt,
  type AssessmentAnswers,
  type AssessmentResult,
} from "./assessment-api";

export const actionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryActionClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function AssessmentQuestions({
  attempt,
  index,
  answers,
  pending,
  canSubmit,
  onAnswer,
  onNavigate,
  onSubmit,
}: {
  attempt: AssessmentAttempt;
  index: number;
  answers: AssessmentAnswers;
  pending: boolean;
  canSubmit: boolean;
  onAnswer: (questionId: string, optionId: string) => void;
  onNavigate: (index: number) => void;
  onSubmit: () => void;
}) {
  const question = attempt.questions[index];
  const answered = attempt.questions.filter((q) =>
    q.options.some((o) => o.id === answers[q.id]),
  ).length;
  const complete = hasAllAnswers(attempt.questions, answers);
  if (!question)
    return (
      <p role="alert">
        This attempt has no questions available. Return to the skill checks and
        try again.
      </p>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && !pending && canSubmit) onSubmit();
      }}
      className="space-y-5"
    >
      <div className="space-y-3">
        <div
          className="flex flex-wrap justify-between gap-2 font-mono text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span>
            Question {index + 1} of {attempt.questions.length}
          </span>
          <span>
            {answered} of {attempt.questions.length} answered
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin={0}
          aria-valuemax={attempt.questions.length}
          aria-valuenow={answered}
          className="flex gap-1.5"
        >
          {attempt.questions.map((q) => (
            <span
              key={q.id}
              className={`h-2 min-w-0 flex-1 rounded-sm ${answers[q.id] ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
      </div>
      <fieldset
        disabled={pending}
        className="min-w-0 rounded-lg border bg-card p-5 sm:p-7"
        key={question.id}
      >
        <legend className="sr-only">{question.prompt}</legend>
        <h2
          className="mb-6 text-xl font-semibold leading-relaxed sm:text-2xl"
          aria-hidden="true"
        >
          {question.prompt}
        </h2>
        <div className="space-y-3">
          {question.options.map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring ${answers[question.id] === option.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"} ${pending ? "cursor-wait opacity-70" : ""}`}
            >
              <input
                type="radio"
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
                name={`question-${question.id}`}
                value={option.id}
                checked={answers[question.id] === option.id}
                onChange={() => onAnswer(question.id, option.id)}
              />
              <span className="min-w-0 break-words text-sm leading-relaxed">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap justify-between gap-3">
        <button
          type="button"
          className={secondaryActionClass}
          disabled={index === 0 || pending}
          onClick={() => onNavigate(index - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className={secondaryActionClass}
          disabled={index === attempt.questions.length - 1 || pending}
          onClick={() => onNavigate(index + 1)}
        >
          Next question
        </button>
      </div>
      <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-sm text-muted-foreground">
          {complete
            ? "Every question is answered. You can still review before submitting."
            : "Answer every question before submitting. Use Previous and Next question to review."}
        </p>
        <button
          type="submit"
          className={`${actionClass} shrink-0`}
          disabled={!complete || pending || !canSubmit}
        >
          {pending ? "Checking result…" : "Submit answers"}
        </button>
      </div>
    </form>
  );
}

export function AssessmentMethodology() {
  return (
    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
      A foundation knowledge check, not proctored identity verification. Scores
      reflect correct answers on this check, not professional seniority,
      verified employment, or proof of real-world performance.
    </p>
  );
}

export function AssessmentResultCard({ result }: { result: AssessmentResult }) {
  const date = new Date(result.completedAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? "Completion date unavailable"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
  return (
    <article className="min-w-0 rounded-lg border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-2 font-mono text-xs text-muted-foreground">
            {result.skill} · Foundation knowledge
          </p>
          <h3 className="text-lg font-semibold">{result.title}</h3>
          <p className="mt-2 text-sm leading-relaxed">{result.remark}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-3xl font-semibold text-primary">
            {result.score}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {result.correct} of {result.total} correct
          </p>
        </div>
      </div>
      <p className="mt-5 border-t pt-3 font-mono text-xs text-muted-foreground">
        Completed <time dateTime={result.completedAt}>{dateLabel}</time> · UTC
      </p>
    </article>
  );
}

export function AssessmentResultsContent({
  results = [],
  loading = false,
  error,
  isMe = false,
  onRetry,
}: {
  results?: AssessmentResult[];
  loading?: boolean;
  error?: unknown;
  isMe?: boolean;
  onRetry: () => void;
}) {
  return (
    <section aria-label="Skill-check results" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Knowledge, with context
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Skill-check results</h2>
        </div>
        {isMe && (
          <Link href="/assessments" className={secondaryActionClass}>
            Take a skill check
          </Link>
        )}
      </div>
      <AssessmentMethodology />
      {loading ? (
        <p
          role="status"
          className="rounded-lg border bg-card p-6 text-sm text-muted-foreground"
        >
          Loading skill-check results…
        </p>
      ) : error ? (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-destructive/40 bg-card p-5"
        >
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Could not load skill-check results. Try again."}
          </p>
          <button
            type="button"
            className={secondaryActionClass}
            onClick={onRetry}
          >
            Retry results
          </button>
        </div>
      ) : results.length ? (
        <>
          <div
            className={`grid gap-4 ${results.length > 1 ? "lg:grid-cols-2" : ""}`}
          >
            {results.map((result) => (
              <AssessmentResultCard key={result.id} result={result} />
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Scoring: correct answers ÷ total questions × 100. Questions are
            equally weighted. The remark is supplied by the check&apos;s scoring
            rules.
          </p>
        </>
      ) : (
        <div className="rounded-lg border border-dashed p-6">
          <p className="font-medium">No completed skill checks yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isMe
              ? "Complete a check to add your first result here."
              : "This profile has no published skill-check results."}
          </p>
        </div>
      )}
    </section>
  );
}

export function AssessmentCatalogContent({
  assessments,
  canAct,
  sessionPending,
  pendingId,
  onStart,
}: {
  assessments: Assessment[];
  canAct: boolean;
  sessionPending: boolean;
  pendingId: string | null;
  onStart: (id: string) => void;
}) {
  return (
    <div className="space-y-7">
      <header className="max-w-3xl space-y-4">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Skill checks / foundation knowledge
        </p>
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
          Put your foundations to the test.
        </h1>
        <p className="max-w-2xl leading-relaxed text-muted-foreground">
          Choose a short knowledge check. Work through the questions, review
          your answers, and add a scored result to your profile.
        </p>
        <AssessmentMethodology />
      </header>
      {assessments.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {assessments.map((assessment) => (
            <article
              key={assessment.id}
              className="flex min-w-0 flex-col rounded-lg border bg-card p-5 sm:p-6"
            >
              <p className="mb-3 font-mono text-xs text-muted-foreground">
                {assessment.skill}
              </p>
              <h2 className="mb-2 text-xl font-semibold">{assessment.title}</h2>
              <p className="mb-5 flex-1 text-sm leading-relaxed text-muted-foreground">
                {assessment.description}
              </p>
              <p className="mb-5 border-t pt-4 font-mono text-xs text-muted-foreground">
                {assessment.questionCount} questions ·{" "}
                {assessment.durationMinutes} min estimated
              </p>
              {canAct ? (
                <button
                  type="button"
                  className={actionClass}
                  disabled={pendingId !== null}
                  onClick={() => onStart(assessment.id)}
                  aria-label={`Start ${assessment.title}`}
                >
                  {pendingId === assessment.id
                    ? "Starting check…"
                    : "Start check"}
                </button>
              ) : sessionPending ? (
                <button type="button" className={actionClass} disabled>
                  Checking sign-in…
                </button>
              ) : (
                <Link
                  className={secondaryActionClass}
                  href="/auth?next=%2Fassessments"
                >
                  Sign in to start
                </Link>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          No skill checks are available yet. Check back later.
        </p>
      )}
    </div>
  );
}
