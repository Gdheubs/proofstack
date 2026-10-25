import type { Metadata } from "next";
import { OpportunityBrowse } from "@/features/careers/boards";

export const metadata: Metadata = {
  title: "Opportunities",
  description: "Jobs, internships, contracts and collaborations.",
};

export default function Page() {
  return <OpportunityBrowse />;
}
