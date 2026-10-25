import type { Metadata } from "next";
import {
  MyResultsView,
  SkillsShell,
} from "@/features/assessments/skills-shell";

export const metadata: Metadata = { title: "Your results" };

export default function Page() {
  return (
    <SkillsShell>
      <MyResultsView />
    </SkillsShell>
  );
}
