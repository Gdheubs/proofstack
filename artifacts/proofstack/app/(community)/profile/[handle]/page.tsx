import { ProfileView } from "@/components/community/profile-view";
export default async function Page({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <ProfileView handle={decodeURIComponent(handle)} />;
}
