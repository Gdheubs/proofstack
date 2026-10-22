import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Sans, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AgreementGate } from "@/features/legal/agreement";
import { BrowserMonitoring } from "@/features/monitoring/browser-monitoring";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const serif = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: { default: "ProofStack", template: "%s | ProofStack" },
  description:
    "Show your projects, build with collaborators, and discover your next career opportunity.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <body className="grain min-h-[100dvh] flex flex-col">
        <Providers nonce={nonce}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <AgreementGate />
          <BrowserMonitoring />
        </Providers>
      </body>
    </html>
  );
}
