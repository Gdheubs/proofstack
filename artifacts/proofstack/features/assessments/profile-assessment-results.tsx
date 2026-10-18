"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getAssessmentResults } from "./assessment-api";
import { AssessmentResultsContent } from "./assessment-panels";

export function ProfileAssessmentResults({
  handle,
  ownerId,
  isMe = false,
}: {
  handle: string;
  ownerId?: string;
  isMe?: boolean;
}) {
  const query = useQuery({
    queryKey:
      handle === "me"
        ? ["assessment-results", handle, ownerId]
        : ["assessment-results", handle],
    queryFn: ({ signal }) => getAssessmentResults(handle, signal),
    enabled: handle === "me" ? isMe && Boolean(ownerId) : Boolean(handle),
    staleTime: 0,
  });
  return (
    <AssessmentResultsContent
      results={query.data?.results}
      loading={query.isPending}
      error={query.isError ? query.error : undefined}
      isMe={isMe}
      onRetry={() => query.refetch()}
    />
  );
}
