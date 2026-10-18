import { LearningPlanRequest } from "@/features/intelligence/request-forms";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LearningPlanRequest jobId={id} />;
}
