import type { Metadata } from "next";
import { AssessmentCatalogView } from "@/features/assessments/assessment-catalog";
import { SkillsShell } from "@/features/assessments/skills-shell";

export const metadata: Metadata = {
  title: "Skills",
  description: "Short knowledge checks with a scored result on your profile.",
};

export default function Page() {
  return (
    <SkillsShell>
      <AssessmentCatalogView />
    </SkillsShell>
  );
}
