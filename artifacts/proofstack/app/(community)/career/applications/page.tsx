import { redirect } from "next/navigation";

// Applications moved into the Opportunities hub.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ job?: string | string[] }>;
}) {
  const { job } = await searchParams;
  if (
    typeof job === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job)
  )
    redirect(`/opportunities/applications?job=${encodeURIComponent(job)}`);
  redirect("/opportunities/applications");
}
