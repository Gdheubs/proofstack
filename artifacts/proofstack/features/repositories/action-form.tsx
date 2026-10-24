"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useRepositoryRun } from "@/hooks/use-repository";
import { Button } from "@/components/ui/button";
import { StepUpDialog } from "@/features/auth/mfa";
export function ActionForm({
  action,
  children,
  label,
  disabled = false,
}: {
  action: Pick<
    ReturnType<typeof useRepositoryRun>,
    "stepUp" | "factors" | "raw" | "settle" | "error" | "pending" | "canAct"
  >;
  children: ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <>
      <StepUpDialog
        open={!!action.stepUp}
        factors={action.factors}
        run={action.raw}
        onSettle={action.settle}
      />
      {children}
      {action.error && (
        <p role="alert" className="text-sm text-destructive">
          {action.error}
        </p>
      )}
      {/security factor|verification/i.test(action.error) && (
        <Link href="/settings/security" className="text-sm underline">
          Set up account verification
        </Link>
      )}
      <Button
        type="submit"
        disabled={disabled || action.pending || !action.canAct}
      >
        {action.pending ? "Working…" : label}
      </Button>
      {!action.canAct && (
        <Link className="ml-2 underline" href="/auth">
          Sign in
        </Link>
      )}
    </>
  );
}
