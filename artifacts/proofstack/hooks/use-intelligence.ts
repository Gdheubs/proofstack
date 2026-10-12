"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  useRunIntelligenceAction,
  getGetIntelligenceQueryKey,
  type IntelligenceInput,
} from "@workspace/api-client-react";
import { useCsrf } from "@/hooks/use-community";
import { errInfo, useAct, type StepUpState } from "@/hooks/use-auth";
import { useState } from "react";
import { toast } from "sonner";
export function useIntelligenceRun() {
  const { request, canAct, session } = useCsrf();
  const { raw } = useAct();
  const [stepUp, setStepUp] = useState<StepUpState>(null);
  const m = useRunIntelligenceAction({ request, mutation: { gcTime: 0 } });
  const qc = useQueryClient();
  const [error, setError] = useState("");
  return {
    pending: m.isPending || !!stepUp,
    stepUp,
    raw,
    factors: session.data?.factors ?? [],
    settle: (ok: boolean) => {
      const current = stepUp;
      setStepUp(null);
      if (current) (ok ? current.resolve : () => current.reject())();
    },
    canAct,
    viewerId: session.data?.user?.id,
    error,
    run: async (data: IntelligenceInput) => {
      setError("");
      try {
        let r;
        try {
          r = await m.mutateAsync({ data });
        } catch (e) {
          const code = errInfo(e).code;
          if (
            code !== "MFA_STEP_UP_REQUIRED" &&
            !(
              code === "MFA_REQUIRED" &&
              session.data?.factors.some((f) => f.status === "verified")
            )
          )
            throw e;
          await new Promise<void>((resolve, reject) =>
            setStepUp({
              resolve,
              reject: () => reject(new Error("Verification cancelled.")),
            }),
          );
          r = await m.mutateAsync({ data });
        }
        await qc.invalidateQueries({ queryKey: getGetIntelligenceQueryKey() });
        toast.success(r.message);
        return r;
      } catch (e) {
        setError(errInfo(e).message);
        return null;
      }
    },
  };
}
