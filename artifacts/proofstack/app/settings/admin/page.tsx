import type { Metadata } from "next";
import { AdminSection } from "@/features/settings/sections";

export const metadata: Metadata = { title: "Administration" };

export default function Page() {
  return <AdminSection />;
}
