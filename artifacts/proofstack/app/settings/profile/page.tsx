import type { Metadata } from "next";
import { ProfileSection } from "@/features/settings/sections";

export const metadata: Metadata = { title: "Profile" };

export default function Page() {
  return <ProfileSection />;
}
