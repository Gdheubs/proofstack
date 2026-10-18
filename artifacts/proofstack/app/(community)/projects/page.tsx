import type { Metadata } from "next";
import { ProjectsView } from "@/features/community/projects-view";
export const metadata: Metadata = { title: "Projects" };
export default function Page() {
  return <ProjectsView />;
}
