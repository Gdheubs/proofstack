"use client";
import type { ReactNode } from "react";
import {
  getGetAccountQueryKey,
  useGetAccount,
  type AccountDetails,
  type AuthContext,
} from "@workspace/api-client-react";
import { errInfo, useAct } from "@/hooks/use-auth";
import { useGate } from "@/features/account/use-gate";
import { ErrorBlock, Skeleton } from "@/features/auth/shared";
import { StepUpDialog } from "@/features/auth/mfa";
import type { Act } from "@/features/account/sections";

export type Loaded = {
  account: AccountDetails;
  ctx: AuthContext;
  act: Act;
  raw: Act;
  refetch: () => void;
};

// Loads the signed-in account once for a settings section and handles the
// sign-in gate, loading, errors and the MFA step-up dialog in one place.
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: (loaded: Loaded) => ReactNode;
}) {
  const { q, ctx, ok } = useGate();
  const { act, raw, stepUp, settleStepUp } = useAct();
  const acc = useGetAccount({
    query: { queryKey: getGetAccountQueryKey(), enabled: ok },
  });
  let body: ReactNode;
  if (q.isError)
    body = (
      <ErrorBlock
        message={errInfo(q.error).message}
        onRetry={() => q.refetch()}
      />
    );
  else if (!ok || !ctx || acc.isPending) body = <Skeleton className="h-64" />;
  else if (acc.isError)
    body = (
      <ErrorBlock
        message={errInfo(acc.error).message}
        onRetry={() => acc.refetch()}
      />
    );
  else
    body = children({
      account: acc.data,
      ctx,
      act,
      raw,
      refetch: () => void acc.refetch(),
    });
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </header>
      {body}
      <StepUpDialog
        open={!!stepUp}
        factors={ctx?.factors ?? []}
        run={raw}
        onSettle={settleStepUp}
      />
    </section>
  );
}
