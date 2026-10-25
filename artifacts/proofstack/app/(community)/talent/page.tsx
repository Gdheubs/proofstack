import type { Metadata } from "next";
import { TalentDirectory } from "@/features/careers/boards";

export const metadata: Metadata = {
  title: "Talent",
  description: "Developers who chose to be found, shown through their work.",
};

export default function Page() {
  return <TalentDirectory />;
}
