import { Opportunity } from "@/components/careers/job";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Opportunity id={id} />;
}
