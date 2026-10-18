import { ProfileView } from "@/features/community/profile-view";
export default async function Page({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <ProfileView handle={decodeURIComponent(handle)} />;
}
