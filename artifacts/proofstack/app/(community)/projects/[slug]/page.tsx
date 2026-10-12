import { ProjectView } from "@/components/community/project-view";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProjectView slug={decodeURIComponent(slug)} />;
}
