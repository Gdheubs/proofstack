import type { Metadata } from "next";
import { SecuritySection } from "@/features/settings/sections";

export const metadata: Metadata = { title: "Security" };

export default function Page() {
  return <SecuritySection />;
}
