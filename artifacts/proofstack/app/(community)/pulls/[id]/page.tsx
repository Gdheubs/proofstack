import { PullView } from "@/features/pulls/pull-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PullView id={id} />;
}
