"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/hooks/use-auth";
import { Menu } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/community", label: "Community" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/career", label: "Career workspace" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/account", label: "Account" },
  { href: "/auth", label: "Sign in" },
];

const COMMUNITY_PREFIXES = [
  "/community",
  "/posts",
  "/profile",
  "/projects",
  "/repositories",
  "/pulls",
  "/work",
  "/organizations",
  "/search",
  "/notifications",
  "/bookmarks",
  "/assist",
];

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const session = useSession();
  const navigation = NAV.filter(
    (n) => n.href !== "/auth" || !session.data?.authenticated,
  );
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="ProofStack home">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {navigation.map((n) => {
            const active =
              n.href === "/"
                ? path === "/"
                : n.href === "/community"
                  ? COMMUNITY_PREFIXES.some((p) => path.startsWith(p))
                  : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-md px-3 py-2 text-sm transition-colors hover:text-foreground ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}
              >
                {n.label}
                <span
                  className={`absolute inset-x-3 -bottom-px h-0.5 origin-left bg-accent transition-transform duration-300 ${active ? "scale-x-100" : "scale-x-0"}`}
                />
              </Link>
            );
          })}
          <ThemeToggle />
        </nav>
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Navigate</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="mt-4 flex flex-col px-4">
                {navigation.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="border-b py-4 font-serif text-2xl"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
