import { IntelligenceJobView } from "@/features/intelligence/job-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IntelligenceJobView id={id} />;
}
