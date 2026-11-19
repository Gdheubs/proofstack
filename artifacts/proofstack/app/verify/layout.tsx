import type { Metadata } from "next";

// A credential is checked by whoever holds its code; it is never a search
// result (see also app/robots.ts).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
