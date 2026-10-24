import type { Metadata } from "next";
import { NotificationsSection } from "@/features/settings/sections";

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <NotificationsSection />;
}
