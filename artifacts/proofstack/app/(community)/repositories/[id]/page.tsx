import { RepositoryView } from "@/features/repositories/repository-view";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const branch = typeof q.branch === "string" ? q.branch : undefined;
  const path = typeof q.path === "string" ? q.path : undefined;
  const revision = typeof q.revision === "string" ? q.revision : undefined;
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
