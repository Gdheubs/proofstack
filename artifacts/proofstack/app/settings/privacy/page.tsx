import type { Metadata } from "next";
import { PrivacySection } from "@/features/settings/sections";

export const metadata: Metadata = { title: "Privacy & data" };

export default function Page() {
  return <PrivacySection />;
}
