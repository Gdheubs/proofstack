"use client";
import Link from "next/link";
import type { IntelligenceJob } from "@workspace/api-client-react";
import { card } from "@/components/careers/shared";
export function IntelligenceResults({ job }: { job: IntelligenceJob }) {
  const result = job.result;
  if (!result) return null;
  return (
    <section className="space-y-5">
      <div className={card}>
        <h2 className="text-xl font-semibold">Review the results</h2>
        <p>{result.summary}</p>
        <p className="text-sm text-muted-foreground">{result.disclaimer}</p>
        {result.truncated && (
          <p className="text-sm font-medium">
            Coverage is limited. Review the scope and skipped files before
            drawing conclusions.
          </p>
        )}
      </div>
      {result.matches.map((m) => (
        <article className={card} key={m.id}>
          <h3 className="text-lg font-semibold">
            <Link href={`/opportunities/${m.id}`} className="underline">
              {m.title}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            {m.organization} · {m.kind} · {m.workplace}
          </p>
          <p className="text-sm">
            Shared skill labels: {m.matchedSkills.join(", ")}
          </p>
          {m.otherSkills.length > 0 && (
            <p className="text-sm">
              Other skills listed: {m.otherSkills.join(", ")}
            </p>
          )}
          <Link
            href={`/intelligence/plan/${m.id}`}
            className="inline-block text-sm underline"
          >
            Build a learning plan
          </Link>
        </article>
      ))}
      {job.kind === "opportunities" && !result.matches.length && (
        <p className={card}>
          No current opportunities share your listed skills within this run.
          Update your profile or browse all opportunities; this is not a
          judgment of your abilities.
        </p>
      )}
      {result.steps.map((step, i) => (
        <article className={card} key={i}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Practice {i + 1}
          </p>
          <h3 className="text-lg font-semibold">{step.title}</h3>
          <p className="whitespace-pre-wrap">{step.objective}</p>
          <p className="whitespace-pre-wrap text-sm">{step.exercise}</p>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            Evidence to create: {step.evidence}
          </p>
        </article>
      ))}
      {job.kind === "security-scan" && (
        <div className={card}>
          <p className="text-sm">
            Scanned {result.scannedFiles} text files · Skipped{" "}
            {result.skippedFiles} files · {result.findings.length} hints
          </p>
          {!result.findings.length && (
            <p className="text-sm">
              No configured patterns were found in the inspected files. This
              does not establish that the repository is secure.
            </p>
          )}
        </div>
      )}
      {result.findings.map((f, i) => (
        <article key={i} className={card}>
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-semibold">{f.title}</h3>
            <span className="text-xs uppercase">{f.severity} priority</span>
          </div>
          <p className="break-all font-mono text-xs">
            {f.path}:{f.line} · {f.rule}
          </p>
          <p className="text-sm">{f.guidance}</p>
          <Link
            className="text-sm underline"
            href={`/repositories/${job.repositoryId}?${new URLSearchParams({ branch: job.branch, revision: job.commit, path: f.path })}`}
          >
            Inspect this commit
          </Link>
        </article>
      ))}
    </section>
  );
}
