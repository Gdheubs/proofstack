import type { Metadata } from "next";
import { FeedView } from "@/features/community/feed-view";
export const metadata: Metadata = { title: "Community" };
export default function Page() {
  return <FeedView />;
}
