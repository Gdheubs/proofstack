"use client";
import Link from "next/link";
import { useState } from "react";
import {
  getGetAccountQueryKey,
  useGetAccount,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { errInfo, useAct } from "@/hooks/use-auth";
import { ErrorBlock, Notice, Skeleton } from "@/components/auth/shared";
import { StepUpDialog } from "@/components/auth/mfa";
import { useGate } from "@/components/account/use-gate";
import {
  ActivityPanel,
  IdentityPanel,
  OrgPanel,
  PasswordPanel,
  PhonePanel,
  SecurityPanel,
  SessionsPanel,
} from "@/components/account/sections";

export function AccountView() {
  const { q, ctx, ok } = useGate();
  const { act, raw, stepUp, settleStepUp } = useAct();
  const acc = useGetAccount({
    query: { queryKey: getGetAccountQueryKey(), enabled: ok },
  });
  const account = acc.data;
  const privileged = !!ctx?.user?.platformRole;
  const [logoutError, setLogoutError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 rise">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Account
          </p>
          <h1 className="text-4xl font-semibold">
            {ctx?.user ? ctx.user.displayName : "Your account"}
          </h1>
        </div>
        <div className="flex gap-2">
          {privileged && (
            <Button asChild variant="outline">
              <Link href="/account/admin">Administration</Link>
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={async () => {
              setLogoutError(null);
              try {
                await act({ action: "logout", scope: "local" });
              } catch (error) {
                setLogoutError(errInfo(error).message);
                await q.refetch();
              }
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
      {logoutError && <Notice tone="error">{logoutError}</Notice>}
      {ok &&
        account?.activity.some(
          (event) => event.action === "auth.suspicious_login",
        ) && (
          <Notice tone="warn">
            A new device signed in recently. Review your active sessions below
            and revoke any you do not recognize.
          </Notice>
        )}

      {(q.isLoading || (ok && acc.isLoading) || (!ok && !q.isError)) && (
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      )}
      {q.isError && (
        <ErrorBlock
          message={errInfo(q.error).message}
          onRetry={() => q.refetch()}
        />
      )}
      {ok && acc.isError && (
        <ErrorBlock
          message={errInfo(acc.error).message}
          onRetry={() => acc.refetch()}
        />
      )}
      {ok && account && ctx && (
        <div className="grid items-start gap-5 md:grid-cols-2">
          <div className="space-y-5">
            <IdentityPanel account={account} ctx={ctx} act={act} />
            <PhonePanel account={account} ctx={ctx} act={act} />
            <PasswordPanel account={account} ctx={ctx} act={act} />
            <ActivityPanel account={account} ctx={ctx} act={act} />
          </div>
          <div className="space-y-5">
            <SecurityPanel account={account} ctx={ctx} act={act} />
            <SessionsPanel account={account} ctx={ctx} act={act} />
            <OrgPanel account={account} ctx={ctx} act={act} />
          </div>
        </div>
      )}
      <StepUpDialog
        open={!!stepUp}
        factors={ctx?.factors ?? []}
        run={raw}
        onSettle={settleStepUp}
      />
    </div>
  );
}
