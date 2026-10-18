"use client";
import Link from "next/link";
import {
  useGetIntelligence,
  getGetIntelligenceQueryKey,
} from "@workspace/api-client-react";
import { useSession } from "@/hooks/use-auth";
export const kindName = (kind: string) =>
  ({
    opportunities: "Opportunity matches",
    "career-plan": "AI learning plan",
    "security-scan": "Repository security review",
  })[kind] ?? kind;
export function useIntelligenceData(id?: string, offset = 0) {
  const session = useSession(),
    uid = session.data?.user?.id;
  const params = { ...(id ? { id } : {}), offset };
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
      Sign in and complete account verification to access your private
      intelligence workspace.{" "}
      <Link className="underline" href="/auth">
        Sign in
      </Link>
    </p>
  );
}
