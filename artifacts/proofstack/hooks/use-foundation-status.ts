"use client";
import { useCallback, useState } from "react";
import {
  useHealthCheck,
  getHealthCheckQueryKey,
  useReadinessCheck,
  getReadinessCheckQueryKey,
} from "@workspace/api-client-react";

const INTERVAL = 30_000;

export function useFoundationStatus() {
  const health = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: INTERVAL,
      retry: 1,
    },
  });
  const ready = useReadinessCheck({
    query: {
      queryKey: getReadinessCheckQueryKey(),
      refetchInterval: INTERVAL,
      retry: 1,
    },
  });
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const hRefetch = health.refetch;
  const rRefetch = ready.refetch;
  const refresh = useCallback(async () => {
    await Promise.all([hRefetch(), rRefetch()]);
    setCheckedAt(new Date());
  }, [hRefetch, rRefetch]);
  return {
    health,
    ready,
    refresh,
    checkedAt,
    refreshing: health.isFetching || ready.isFetching,
  };
}
