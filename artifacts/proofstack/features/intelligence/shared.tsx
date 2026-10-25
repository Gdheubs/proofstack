"use client";
import Link from "next/link";
import {
  useGetIntelligence,
  getGetIntelligenceQueryKey,
  type GetIntelligenceKind,
} from "@workspace/api-client-react";
import { useSession } from "@/hooks/use-auth";
export const kindName = (kind: string) =>
  ({
    opportunities: "Opportunity matches",
    "career-plan": "AI learning plan",
    "security-scan": "Repository security review",
  })[kind] ?? kind;
// One analysis (id), or the history of one kind, newest first.
export function useIntelligenceData(
  id?: string,
  offset = 0,
  kind?: GetIntelligenceKind,
) {
  const session = useSession(),
    uid = session.data?.user?.id;
  const params = { ...(id ? { id } : {}), ...(kind ? { kind } : {}), offset };
  const query = useGetIntelligence(params, {
    query: {
      queryKey: [...getGetIntelligenceQueryKey(params), uid],
      enabled: !!session.data?.authenticated && !session.data.mfaRequired,
      gcTime: 0,
      refetchInterval: (q) =>
        q.state.data?.jobs.some((j) => ["queued", "running"].includes(j.status))
          ? 5000
          : false,
    },
  });
  return { query, session };
}
export function IntelligenceGate({ loading = false }: { loading?: boolean }) {
  return loading ? (
    <p>Loading your workspace…</p>
  ) : (
    <p className="rounded-xl border p-6">
      Sign in and complete account verification to see your private results.{" "}
      <Link className="underline" href="/auth">
        Sign in
      </Link>
    </p>
  );
}
// Where each kind of analysis is listed after the intelligence workspace split.
export const kindHome = (job: { kind: string; repositoryId: string | null }) =>
  job.kind === "career-plan"
    ? "/assessments/plans"
    : job.kind === "security-scan" && job.repositoryId
      ? `/repositories/${job.repositoryId}/security`
      : "/opportunities/suggested";
