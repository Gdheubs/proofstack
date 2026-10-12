import { LearningPlanRequest } from "@/components/intelligence/request-forms";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LearningPlanRequest jobId={id} />;
}
