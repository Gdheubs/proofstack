import type { Metadata } from "next";
import { OrgsView } from "@/components/community/orgs-view";
export const metadata: Metadata = { title: "Organizations" };
export default function Page() {
  return <OrgsView />;
}
