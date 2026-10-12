import { PullList } from "@/components/pulls/pull-list";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PullList repositoryId={id} />;
}
