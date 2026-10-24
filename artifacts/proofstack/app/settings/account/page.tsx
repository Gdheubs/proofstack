import type { Metadata } from "next";
import { AccountSection } from "@/features/settings/sections";

export const metadata: Metadata = { title: "Account" };

export default function Page() {
  return <AccountSection />;
}
