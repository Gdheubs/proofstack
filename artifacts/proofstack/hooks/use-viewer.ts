"use client";
import {
  getGetCommunityQueryKey,
  useGetCommunity,
} from "@workspace/api-client-react";
import { useCsrf } from "@/hooks/use-community";

// The signed-in member's community profile and unread count, shared by the
// header, the bottom bar and the home page so they make one request.
export function useViewer() {
  const { canAct } = useCsrf();
  const params = { view: "notifications" } as const;
  const query = useGetCommunity(params, {
    query: {
      queryKey: getGetCommunityQueryKey(params),
      enabled: canAct,
      staleTime: 30_000,
      retry: false,
    },
  });
  return {
    viewer: query.data?.viewer ?? null,
    unread: query.data?.unreadCount ?? 0,
    query,
  };
}
