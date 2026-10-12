import { CareerWorkspace } from "@/components/careers/workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job } = await searchParams;
  return <CareerWorkspace jobId={job} />;
}
