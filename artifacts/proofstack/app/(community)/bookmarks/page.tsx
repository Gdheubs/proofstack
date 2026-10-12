import type { Metadata } from "next";
import { BookmarksView } from "@/components/community/bookmarks-view";
export const metadata: Metadata = { title: "Bookmarks" };
export default function Page() {
  return <BookmarksView />;
}
