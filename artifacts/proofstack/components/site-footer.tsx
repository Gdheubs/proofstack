import Link from "next/link";
import { Logo } from "@/components/logo";
import { internalPagesHidden } from "@/lib/internal-pages";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            A home for your projects, your collaborators, and your next
            opportunity.
          </p>
        </div>
        <nav aria-label="Pages" className="flex flex-col gap-2 text-sm">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Pages
          </span>
          <Link className="hover:underline" href="/">
            Overview
          </Link>
          <Link className="hover:underline" href="/opportunities">
            Opportunities
          </Link>
          <Link className="hover:underline" href="/talent">
            Talent directory
          </Link>
        </nav>
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Resources
          </span>
          <Link className="hover:underline" href="/career">
            Career workspace
          </Link>
          {!internalPagesHidden() && (
            <>
              <Link className="hover:underline" href="/foundation">
                System status
              </Link>
              <Link className="hover:underline" href="/design-system">
                Design system
              </Link>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}
