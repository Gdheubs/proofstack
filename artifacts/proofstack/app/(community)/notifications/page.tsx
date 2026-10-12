import type { Metadata } from "next";
import { NotificationsView } from "@/components/community/notifications-view";
export const metadata: Metadata = { title: "Notifications" };
export default function Page() {
  return <NotificationsView />;
}
