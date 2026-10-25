import type { Metadata } from "next";
import {
  PracticePlansView,
  SkillsShell,
} from "@/features/assessments/skills-shell";

export const metadata: Metadata = { title: "Practice plans" };

export default function Page() {
  return (
    <SkillsShell>
      <PracticePlansView />
    </SkillsShell>
  );
}
