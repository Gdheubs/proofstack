import type { Metadata } from "next";

// The exam pages. The header, footer and bottom tabs leave these addresses
// (lib/chrome.ts), search engines never index them, and the attempt gets the
// full height of the screen. They are the only pages whose response allows
// the camera and microphone (next.config.ts), so they are always entered by
// a full page load, never by a link inside the app.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ExamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex min-h-[100dvh] flex-col">{children}</div>;
}
