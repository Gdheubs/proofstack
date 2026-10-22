import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_EFFECTIVE_DATE, legalDetailsComplete } from "@/lib/legal";

export const LEGAL_LINKS = [
  { href: "/about", label: "About" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/community-guidelines", label: "Community Guidelines" },
  { href: "/contact", label: "Contact and grievances" },
] as const;

export function LegalPage({
  eyebrow,
  title,
  intro,
  dated = true,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  dated?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {eyebrow}
      </p>
      <h1 className="mt-2 font-serif text-4xl leading-tight sm:text-5xl">
        {title}
      </h1>
      {dated && (
        <p className="mt-3 text-sm text-muted-foreground">
          Effective {LEGAL_EFFECTIVE_DATE}
        </p>
      )}
      {!legalDetailsComplete() && (
        <p
          role="note"
          className="mt-5 rounded-md border border-dashed p-3 text-sm"
        >
          Operator details marked in brackets are being finalised.
        </p>
      )}
      <div className="mt-6 text-lg leading-relaxed">{intro}</div>
      <div className="legal-body mt-8 space-y-4 leading-relaxed [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:p-2 [&_td]:align-top [&_th]:border [&_th]:p-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
      <nav
        aria-label="Legal pages"
        className="mt-12 flex flex-wrap gap-x-4 gap-y-2 border-t pt-6 text-sm"
      >
        {LEGAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
