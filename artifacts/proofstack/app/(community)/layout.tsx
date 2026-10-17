export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto max-w-6xl px-5 py-8">{children}</div>;
}
