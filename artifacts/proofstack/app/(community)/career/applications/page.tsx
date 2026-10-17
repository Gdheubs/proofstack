import type { Metadata } from "next";
import { Applications } from "@/components/careers/workspace";
import { PageHead } from "@/components/community/ui";

export const metadata: Metadata = { title: "Applications & hiring inbox" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ job?: string | string[] }>;
}) {
  const { job } = await searchParams;
  const jobId = typeof job === "string" ? job : undefined;
  return (
    <div className="space-y-8">
      <PageHead eyebrow="Career workspace" title="Applications & hiring inbox">
        <p className="max-w-xl text-sm text-muted-foreground">
          Follow your applications, review candidates and open a private
          conversation.
        </p>
      </PageHead>
      <Applications key={jobId || "all"} jobId={jobId} />
    </div>
  );
}
