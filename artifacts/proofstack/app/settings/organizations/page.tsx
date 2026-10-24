import type { Metadata } from "next";
import { OrganizationsSection } from "@/features/settings/sections";

export const metadata: Metadata = { title: "Organizations" };

export default function Page() {
  return <OrganizationsSection />;
}
