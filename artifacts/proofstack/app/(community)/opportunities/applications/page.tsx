import type { Metadata } from "next";
import { Applications } from "@/features/careers/workspace";
import { OpportunitiesShell } from "@/features/opportunities/shell";

export const metadata: Metadata = { title: "My applications" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ job?: string | string[] }>;
}) {
  const { job } = await searchParams;
  const jobId = typeof job === "string" ? job : undefined;
  return (
    <OpportunitiesShell
      title={jobId ? "Applications for this listing" : "My applications"}
      intro="Follow your applications and open a private conversation with the hiring team."
    >
      <Applications key={jobId || "all"} jobId={jobId} />
    </OpportunitiesShell>
  );
}
