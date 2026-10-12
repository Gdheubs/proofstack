import { ApplicationThread } from "@/components/careers/workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApplicationThread id={id} />;
}
