import { RepositoryList } from "@/components/repositories/repository-list";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  return <RepositoryList projectId={project} />;
}
