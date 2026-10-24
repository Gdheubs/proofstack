import type { Metadata } from "next";
import { AppearanceSection } from "@/features/settings/sections";

export const metadata: Metadata = { title: "Appearance" };

export default function Page() {
  return <AppearanceSection />;
}
