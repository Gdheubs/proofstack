import { RepositoryList } from "@/features/repositories/repository-list";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const { project } = await searchParams;
  return (
    <RepositoryList
      projectId={typeof project === "string" ? project : undefined}
    />
  );
}
