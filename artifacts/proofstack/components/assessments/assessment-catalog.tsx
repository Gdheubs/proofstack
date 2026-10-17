"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCsrf } from "../../hooks/use-community";
import {
  createAssessmentActionGuard,
  getAssessmentCatalog,
  startAssessment,
} from "./assessment-api";
import {
  AssessmentCatalogContent,
  secondaryActionClass,
} from "./assessment-panels";

export function AssessmentCatalogView() {
  const router = useRouter();
  const { csrf, canAct, session } = useCsrf();
  const query = useQuery({
    queryKey: ["assessment-catalog"],
    queryFn: ({ signal }) => getAssessmentCatalog(signal),
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guard = useRef(createAssessmentActionGuard());
  async function start(id: string) {
    if (!canAct) return;
    await guard.current.run(async () => {
      setPendingId(id);
      setError(null);
      try {
        const attempt = await startAssessment(id, csrf);
        router.push(`/assessments/${encodeURIComponent(attempt.id)}`);
      } catch (problem) {
        setError(
          problem instanceof Error
            ? problem.message
            : "Could not start this check. Try again.",
        );
      } finally {
        setPendingId(null);
      }
    });
  }
  if (query.isPending)
    return (
      <p
        role="status"
        className="rounded-lg border bg-card p-6 text-sm text-muted-foreground"
      >
        Loading skill checks…
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="space-y-3 rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-semibold">Skill checks could not load</h1>
        <p className="text-sm text-destructive">{query.error.message}</p>
        <button
          type="button"
          className={secondaryActionClass}
          onClick={() => query.refetch()}
        >
          Retry skill checks
        </button>
      </div>
    );
  return (
    <div className="space-y-5">
      {session.isError && (
        <div role="alert" className="space-y-3 rounded-lg border p-4">
          <p className="text-sm">
            Your sign-in status could not be checked. Retry before starting a
            check.
          </p>
          <button
            type="button"
            className={secondaryActionClass}
            onClick={() => session.refetch()}
          >
            Retry sign-in status
          </button>
        </div>
      )}
      {session.data?.mfaRequired && (
        <p role="status" className="text-sm text-muted-foreground">
          Complete sign-in before starting a skill check.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <AssessmentCatalogContent
        assessments={query.data.assessments}
        canAct={canAct}
        sessionPending={session.isPending || session.isError}
        pendingId={pendingId}
        onStart={start}
      />
    </div>
  );
}
