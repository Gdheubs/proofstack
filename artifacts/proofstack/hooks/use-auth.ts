"use client";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAccountQueryKey,
  getGetAccountUsersQueryKey,
  getGetAuthContextQueryKey,
  getGetCommunityQueryKey,
  getGetCareersQueryKey,
  getGetRepositoriesQueryKey,
  getGetPullsQueryKey,
  getGetIntelligenceQueryKey,
  getGetOperationsQueryKey,
  useGetAuthContext,
  useRunAuthAction,
  type AuthActionInput,
  type AuthActionResult,
} from "@workspace/api-client-react";

export function errInfo(e: unknown): { code?: string; message: string } {
  const d = (e as { data?: { error?: { code?: string; message?: string } } })
    ?.data?.error;
  if (d) return { code: d.code, message: d.message ?? "Request failed." };
  return {
    message:
      e instanceof Error ? e.message : "Something went wrong. Try again.",
  };
}

export function useSession() {
  return useGetAuthContext({
    query: { queryKey: getGetAuthContextQueryKey(), staleTime: 0 },
  });
}

const IDENTITY_ACTIONS = new Set([
  "logout",
  "update-password",
  "mfa-remove",
  "recover-mfa",
  "password-login",
  "verify-otp",
  "signup",
  "accept-terms",
  "delete-account",
]);

export type StepUpState = { resolve: () => void; reject: () => void } | null;

export function useAct() {
  const qc = useQueryClient();
  const m = useRunAuthAction();
  const [stepUp, setStepUp] = useState<StepUpState>(null);
  const mutate = m.mutateAsync;

  const refresh = useCallback(
    async (identity: boolean) => {
      if (identity) {
        await qc.cancelQueries({ queryKey: getGetOperationsQueryKey() });
        await qc.resetQueries({ queryKey: getGetOperationsQueryKey() });
        await qc.cancelQueries({ queryKey: getGetIntelligenceQueryKey() });
        await qc.resetQueries({ queryKey: getGetIntelligenceQueryKey() });
        await qc.cancelQueries({ queryKey: getGetPullsQueryKey() });
        await qc.resetQueries({ queryKey: getGetPullsQueryKey() });
        await qc.cancelQueries({ queryKey: getGetRepositoriesQueryKey() });
        await qc.resetQueries({ queryKey: getGetRepositoriesQueryKey() });
        await qc.cancelQueries({ queryKey: getGetCareersQueryKey() });
        await qc.resetQueries({ queryKey: getGetCareersQueryKey() });
        // Community responses contain viewer-specific private tenant data.
        // Clear/refetch active data, not just identity screens, on account switches.
        await qc.cancelQueries({ queryKey: getGetCommunityQueryKey() });
        await qc.resetQueries({ queryKey: getGetCommunityQueryKey() });
        qc.removeQueries({ queryKey: getGetAccountQueryKey() });
        qc.removeQueries({ queryKey: getGetAccountUsersQueryKey() });
        await qc.invalidateQueries({ queryKey: getGetAuthContextQueryKey() });
      } else {
        await Promise.all([
          qc.invalidateQueries({ queryKey: getGetAuthContextQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetAccountQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetAccountUsersQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetCommunityQueryKey() }),
        ]);
      }
    },
    [qc],
  );

  const raw = useCallback(
    async (data: AuthActionInput): Promise<AuthActionResult> => {
      const r = await mutate({ data });
      await refresh(
        // A native MFA step-up changes assurance, not identity. Keep its modal
        // mounted while refreshing account data and retrying the action.
        IDENTITY_ACTIONS.has(data.action) || !!r.signedOut,
      );
      return r;
    },
    [mutate, refresh],
  );

  const act = useCallback(
    async (data: AuthActionInput): Promise<AuthActionResult> => {
      try {
        return await raw(data);
      } catch (e) {
        if (errInfo(e).code === "MFA_STEP_UP_REQUIRED") {
          await new Promise<void>((resolve, reject) =>
            setStepUp({ resolve, reject }),
          );
          return raw(data);
        }
        throw e;
      }
    },
    [raw],
  );

  const settleStepUp = (ok: boolean) => {
    setStepUp((s) => {
      if (s) (ok ? s.resolve : s.reject)();
      return null;
    });
  };

  return { act, raw, pending: m.isPending, stepUp, settleStepUp, refresh };
}
