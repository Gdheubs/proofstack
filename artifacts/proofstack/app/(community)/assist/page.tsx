import type { Metadata } from "next";
import { AssistView } from "@/components/community/assist-view";
export const metadata: Metadata = { title: "Assist" };
export default function Page() {
  return <AssistView />;
}
