import type { Metadata } from "next";
import { ProfileSettings } from "@/components/community/profile-settings";
export const metadata: Metadata = { title: "Profile settings" };
export default function Page() {
  return <ProfileSettings />;
}
