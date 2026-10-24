import type { Metadata } from "next";
import { CareerSection } from "@/features/settings/sections";

export const metadata: Metadata = { title: "Career" };

export default function Page() {
  return <CareerSection />;
}
