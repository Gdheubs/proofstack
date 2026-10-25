import type { Metadata } from "next";
import { SuggestedView } from "@/features/opportunities/suggested";

export const metadata: Metadata = { title: "Suggested for you" };

export default function Page() {
  return <SuggestedView />;
}
