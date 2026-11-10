"use client";
import {
  getGetRepositoriesQueryKey,
  useGetRepositories,
} from "@workspace/api-client-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { QueryError } from "@/features/community/ui";
import { RepositoryView } from "./repository-view";

// /<owner handle>/<name>: find the repository by its address, then show it
// exactly as /repositories/<id> does.
export function RepositoryByName({
  owner,
  name,
  branch,
  path,
  revision,
}: {
  owner: string;
  name: string;
  branch?: string;
  path?: string;
  revision?: string;
}) {
  const params = { owner, name };
  const q = useGetRepositories(params, {
    query: { queryKey: getGetRepositoriesQueryKey(params), retry: false },
  });
  const router = useRouter();
  const found = q.data?.repositories[0];
  // An old username (renamed in the last 90 days) moves to the current one.
  useEffect(() => {
    if (
      found?.ownerHandle &&
      found.ownerHandle.toLowerCase() !== owner.toLowerCase()
    )
      router.replace(`/${found.ownerHandle}/${found.name}`);
  }, [found, owner, router]);
  if (q.isPending) return <p role="status">Loading repository…</p>;
  if (q.error)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const id = q.data?.repositories[0]?.id;
  if (!id) return <p>Repository not found.</p>;
  return (
    <RepositoryView
      key={JSON.stringify([id, branch, path, revision])}
      id={id}
      branch={branch}
      path={path}
      revision={revision}
    />
  );
}
