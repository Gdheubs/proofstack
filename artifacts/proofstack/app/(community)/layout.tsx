import { CommunityNav } from "@/components/community/community-nav";

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CommunityNav />
      <div className="mx-auto max-w-6xl px-5 py-8">{children}</div>
    </>
  );
}
