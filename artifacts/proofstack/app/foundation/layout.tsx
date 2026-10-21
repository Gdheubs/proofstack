import { notFound } from "next/navigation";
import { internalPagesHidden } from "@/lib/internal-pages";

export default function FoundationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (internalPagesHidden()) notFound();
  return children;
}
