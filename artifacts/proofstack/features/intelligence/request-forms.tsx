"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useGetCareers,
  useGetRepositories,
  getGetRepositoriesQueryKey,
} from "@workspace/api-client-react";
import { PageHead, QueryError } from "@/features/community/ui";
import { card, field } from "@/features/careers/shared";
import { ActionForm } from "@/features/repositories/action-form";
import { useIntelligenceRun } from "@/hooks/use-intelligence";
import { IntelligenceGate, useIntelligenceData } from "./shared";
import { RepositoryNavigation } from "../repositories/repository-navigation";
export function LearningPlanRequest({ jobId }: { jobId: string }) {
  const q = useGetCareers({ view: "job", id: jobId }),
    { query: config, session } = useIntelligenceData(),
    a = useIntelligenceRun(),
    router = useRouter(),
    requestKey = useRef("");
  if (!session.data?.authenticated || session.data.mfaRequired)
    return <IntelligenceGate loading={session.isPending} />;
  if (q.isPending || config.isPending)
    return <p>Loading learning plan options…</p>;
  if (q.error)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (config.error)
    return <QueryError error={config.error} onRetry={() => config.refetch()} />;
  const job = q.data?.jobs[0];
  if (!job) return null;
  return (
    <>
      <PageHead
        eyebrow="AI-assisted practice · Your review required"
        title="Build a learning plan"
      >
        <Link className="underline" href={`/opportunities/${jobId}`}>
          View opportunity
        </Link>
      </PageHead>
      <form
        className={card + " max-w-2xl"}
        onSubmit={async (e) => {
          e.preventDefault();
          requestKey.current ||= crypto.randomUUID();
          const r = await a.run({
            action: "enqueue",
            kind: "career-plan",
            requestKey: requestKey.current,
            jobId,
            consent: true,
          });
          if (r) router.push(`/intelligence/${r.id}`);
        }}
      >
        <h2 className="text-xl font-semibold">{job.title}</h2>
        <p className="text-sm">
          Skill topics: {job.skills.join(", ") || "No skill topics listed"}
        </p>
        <p className="text-sm text-muted-foreground">
          The configured AI provider will receive your self-reported skill
          labels and this opportunity’s skill labels. Names, applications,
          private messages, and repository code are not included. The resulting
          plan is private and does not evaluate your eligibility for the role.
        </p>
        {!config.data?.aiEnabled && (
          <p className="text-sm">
            Learning plans require an operator-configured AI provider and model.
          </p>
        )}
        <ActionForm
          action={a}
          disabled={!config.data?.aiEnabled}
          label="Generate practice plan"
        >
          <label className="flex items-start gap-3 text-sm">
            <input className="mt-1" type="checkbox" required />I agree to send
            these skill labels to the configured AI provider for this plan. I
            will review the generated suggestions.
          </label>
        </ActionForm>
      </form>
    </>
  );
}
export function SecurityScanRequest({
  repositoryId,
}: {
  repositoryId: string;
}) {
  const [branch, setBranch] = useState<string | undefined>(undefined),
    a = useIntelligenceRun(),
    router = useRouter(),
    requestKey = useRef("");
  const { query: config, session } = useIntelligenceData();
  const params = { id: repositoryId, branch };
  const q = useGetRepositories(params, {
    query: {
      queryKey: getGetRepositoriesQueryKey(params),
      enabled: !!session.data?.authenticated,
      refetchOnWindowFocus: false,
    },
  });
  if (!session.data?.authenticated || session.data.mfaRequired)
    return <IntelligenceGate loading={session.isPending} />;
  if (q.isPending || config.isPending) return <p>Loading repository…</p>;
  if (q.error)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (config.error)
    return <QueryError error={config.error} onRetry={() => config.refetch()} />;
  const d = q.data,
    r = d?.repositories[0];
  if (!d || !r) return null;
  return (
    <>
      <PageHead
        eyebrow="Bounded static analysis"
        title="Repository security review"
      >
        <Link className="underline" href="/intelligence">
          Your analysis history
        </Link>
      </PageHead>
      <RepositoryNavigation
        repositoryId={repositoryId}
        canManage={r.canManage}
        active="security"
      />
      {!r.canManage ? (
        <p className={card}>
          Only current project managers can request or view their private
          repository scans.
        </p>
      ) : (
        <form
          key={d.head}
          className={card + " max-w-2xl"}
          onSubmit={async (e) => {
            e.preventDefault();
            requestKey.current ||= crypto.randomUUID();
            const result = await a.run({
              action: "enqueue",
              kind: "security-scan",
              repositoryId,
              branch: d.branch,
              expectedHead: d.head,
              requestKey: requestKey.current,
            });
            if (result) {
              requestKey.current = "";
              router.push(`/intelligence/${result.id}`);
            }
          }}
        >
          <h2 className="text-xl font-semibold">{r.projectTitle}</h2>
          <p className="text-sm text-muted-foreground">
            Looks for possible credentials, disabled TLS checks, and dynamic
            evaluation. No project code is executed or sent to an AI provider.
            Results are heuristic hints and require manual review.
          </p>
          <label className="block text-sm">
            Branch
            <select
              className={field}
              value={d.branch}
              onChange={(e) => {
                setBranch(e.target.value);
                requestKey.current = "";
              }}
            >
              {d.branches.map((b) => (
                <option key={b.name}>{b.name}</option>
              ))}
            </select>
          </label>
          <p className="break-all font-mono text-xs">Commit: {d.head}</p>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => {
              requestKey.current = "";
              void q.refetch();
            }}
          >
            Refresh commit
          </button>
          <p className="text-xs text-muted-foreground">
            At most 200 files, 32 KiB per text file, 2 MiB total, and 100
            findings. Skipped files and limited coverage are reported.
            Dependencies, CVEs, runtime behavior, and older commits are outside
            this scan.
          </p>
          <ActionForm
            action={a}
            disabled={!config.data?.enabled}
            label="Queue private scan"
          >
            <label className="flex gap-2 text-sm">
              <input type="checkbox" required />
              Scan this commit. I understand this is not a security
              certification.
            </label>
            <p className="text-xs text-muted-foreground">
              A fresh security-factor verification is required.
            </p>
          </ActionForm>
        </form>
      )}
    </>
  );
}
