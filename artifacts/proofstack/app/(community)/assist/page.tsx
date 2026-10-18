import type { Metadata } from "next";
import { AssistView } from "@/features/community/assist-view";
export const metadata: Metadata = { title: "Assist" };
export default function Page() {
  return <AssistView />;
}
