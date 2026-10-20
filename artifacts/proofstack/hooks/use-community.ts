"use client";
import { useCallback, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCommunity,
  getGetCommunityQueryKey,
  useAssistCommunity,
  useRequestCommunityUpload,
  useRunCommunityAction,
  type CommunityAssistInput,
  type CommunityInput,
  type CommunityResult,
  type GetCommunityParams,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { errInfo, useSession } from "@/hooks/use-auth";

export function useCsrf() {
  const s = useSession();
  const csrf = s.data?.csrfToken ?? "";
  const canAct = !!s.data?.authenticated && !s.data.mfaRequired;
  return {
    csrf,
    canAct,
    session: s,
    request: { headers: { "X-CSRF-Token": csrf } },
  };
}

const isCommunityKey = (k: readonly unknown[]) =>
  k[0] === getGetCommunityQueryKey()[0];

/** Runs a community action with CSRF, refreshes every community view and reports the real API message. */
export function useCommunityRun() {
  const { request } = useCsrf();
  const qc = useQueryClient();
  const m = useRunCommunityAction({ request });
  const mutate = m.mutateAsync;
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | undefined>();
  const run = useCallback(
    async (
      data: CommunityInput,
      success?: string,
    ): Promise<CommunityResult | null> => {
      setError(null);
      setCode(undefined);
      try {
        const r = await mutate({ data });
        await qc.invalidateQueries({
          predicate: (q) => isCommunityKey(q.queryKey),
        });
        toast.success(success ?? r.message);
        return r;
      } catch (e) {
        const i = errInfo(e);
        setError(i.message);
        setCode(i.code);
        toast.error(i.message);
        return null;
      }
    },
    [mutate, qc],
  );
  return {
    run,
    pending: m.isPending,
    error,
    code,
    clearError: () => setError(null),
  };
}

export function useCommunityList(
  params: Omit<GetCommunityParams, "offset">,
  enabled = true,
) {
  const q = useInfiniteQuery({
    queryKey: [...getGetCommunityQueryKey(params), "pages"],
    queryFn: ({ pageParam }) => getCommunity({ ...params, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + 20 : undefined),
    enabled,
  });
  return { q, pages: q.data?.pages ?? [] };
}
export type CommunityList = ReturnType<typeof useCommunityList>;

export function useCommunityAssist() {
  const { request } = useCsrf();
  const m = useAssistCommunity({ request });
  return {
    assist: (d: CommunityAssistInput) => m.mutateAsync({ data: d }),
    pending: m.isPending,
    reset: m.reset,
  };
}

const MAX = 8 * 1024 * 1024;
export function useCommunityUpload() {
  const { request, csrf } = useCsrf();
  const up = useRequestCommunityUpload({ request });
  const { run } = useCommunityRun();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File): Promise<string | null> => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Use a PNG, JPEG or WebP image.");
      return null;
    }
    if (file.size > MAX || file.size < 1) {
      toast.error("Images must be 8 MiB or smaller.");
      return null;
    }
    setBusy(true);
    try {
      const u = await up.mutateAsync({
        data: {
          name: file.name.slice(0, 150),
          size: file.size,
          contentType: file.type as "image/png" | "image/jpeg" | "image/webp",
        },
      });
      // Same-origin API endpoint: the API validates and stores the bytes.
      const put = await fetch(u.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type, "X-CSRF-Token": csrf },
        body: file,
      });
      if (!put.ok) {
        const failure = (await put.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          failure?.error?.message ?? "The image upload was rejected.",
        );
      }
      const done = await run(
        { action: "asset-complete", id: u.id },
        "Image uploaded.",
      );
      return done ? u.assetPath : null;
    } catch (e) {
      toast.error(errInfo(e).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}
