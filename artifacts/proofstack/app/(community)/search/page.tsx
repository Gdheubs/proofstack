import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchView } from "@/components/community/search-view";
export const metadata: Metadata = { title: "Search" };
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SearchView />
    </Suspense>
  );
}
