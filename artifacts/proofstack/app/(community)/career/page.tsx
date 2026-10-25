import { redirect } from "next/navigation";

// The career workspace moved into the Opportunities hub.
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
    redirect(`/opportunities/applications?job=${encodeURIComponent(job)}`);
  redirect("/opportunities/hiring");
}
