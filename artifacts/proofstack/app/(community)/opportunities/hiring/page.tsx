import type { Metadata } from "next";
import { HiringView } from "@/features/opportunities/hiring";

export const metadata: Metadata = { title: "Hiring" };

export default function Page() {
  return <HiringView />;
}
