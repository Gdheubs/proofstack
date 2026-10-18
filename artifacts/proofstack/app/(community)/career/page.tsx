import { CareerWorkspace } from "@/features/careers/workspace";
import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ job?: string | string[] }>;
}) {
  const { job } = await searchParams;
  // Keep bookmarked listing inboxes working without accepting arbitrary query values.
  if (
    typeof job === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job)
  )
    redirect(`/career/applications?job=${encodeURIComponent(job)}`);
  return <CareerWorkspace />;
}
