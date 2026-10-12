import { OrgView } from "@/components/community/org-view";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <OrgView slug={decodeURIComponent(slug)} />;
}
