import type { Metadata } from "next";
import { ConnectionsSection } from "@/features/settings/sections";

export const metadata: Metadata = { title: "Connections" };

export default function Page() {
  return <ConnectionsSection />;
}
