"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/hooks/use-auth";
import { ChevronDown, Menu } from "lucide-react";
import {
  getGetCommunityQueryKey,
  useGetCommunity,
} from "@workspace/api-client-react";
import { useCsrf } from "@/hooks/use-community";
import {
  NAV,
  getNavigationSection,
  isNavigationLinkActive,
  pathMatches,
} from "@/lib/navigation";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const section = getNavigationSection(path);
  const [expanded, setExpanded] = useState<string | undefined>(section?.href);
  const session = useSession();
  const { canAct } = useCsrf();
  const params = { view: "notifications" } as const;
  const notifications = useGetCommunity(params, {
    query: {
      queryKey: getGetCommunityQueryKey(params),
      enabled: canAct,
      staleTime: 30_000,
      retry: false,
    },
  });
  const unread = notifications.data?.unreadCount ?? 0;
  const label = (href: string, text: string) => (
    <span className="flex items-center gap-2">
      {text}
      {href === "/notifications" && unread > 0 && (
        <span
          aria-label={`${unread} unread notifications`}
          className="rounded-full bg-accent px-1.5 font-mono text-xs text-accent-foreground"
        >
          {unread}
        </span>
      )}
    </span>
  );
  const navClass = (active: boolean) =>
    `rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="ProofStack home">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) =>
            n.children.length ? (
              <DropdownMenu key={n.href}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-current={section === n ? "true" : undefined}
                    className={
                      navClass(section === n) +
                      " inline-flex items-center gap-1.5"
                    }
                  >
                    {n.label}
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={10}
                  className="w-80 max-w-[calc(100vw-2rem)] p-2"
                >
                  {n.children.map((child) => (
                    <DropdownMenuItem key={child.href} asChild className="p-3">
                      <Link
                        href={child.href}
                        aria-current={
                          isNavigationLinkActive(path, child.href)
                            ? "page"
                            : undefined
                        }
                        className="flex flex-col items-start gap-1"
                      >
                        <span className="font-medium">
                          {label(child.href, child.label)}
                        </span>
                        <span className="text-xs leading-relaxed text-muted-foreground">
                          {child.description}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                key={n.href}
                href={n.href}
                aria-current={section === n ? "page" : undefined}
                className={navClass(section === n)}
              >
                {n.label}
              </Link>
            ),
          )}
        </nav>
        <div className="flex items-center gap-1">
          <Link
            href="/account"
            aria-current={pathMatches(path, "/account") ? "page" : undefined}
            className={
              navClass(pathMatches(path, "/account")) + " hidden lg:inline-flex"
            }
          >
            Account
          </Link>
          {!session.data?.authenticated && (
            <Link
              href="/auth"
              className="hidden rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:inline-flex"
            >
              Sign in
            </Link>
          )}
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                className="lg:hidden"
                onClick={() => setExpanded(section?.href)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Navigate</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="mt-4 flex flex-col px-4 pb-6">
                {NAV.map((n) =>
                  n.children.length ? (
                    <div key={n.href} className="border-b py-1">
                      <button
                        type="button"
                        aria-expanded={expanded === n.href}
                        aria-controls={`mobile-${n.label.replaceAll(" ", "-")}`}
                        className="flex min-h-12 w-full items-center justify-between py-3 text-left font-medium focus-visible:outline-2 focus-visible:outline-ring"
                        onClick={() =>
                          setExpanded(expanded === n.href ? undefined : n.href)
                        }
                      >
                        {n.label}
                        <ChevronDown
                          aria-hidden="true"
                          className={`h-4 w-4 transition-transform motion-reduce:transition-none ${expanded === n.href ? "rotate-180" : ""}`}
                        />
                      </button>
                      <div
                        id={`mobile-${n.label.replaceAll(" ", "-")}`}
                        hidden={expanded !== n.href}
                        className="space-y-1 pb-3"
                      >
                        {n.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setOpen(false)}
                            aria-current={
                              isNavigationLinkActive(path, child.href)
                                ? "page"
                                : undefined
                            }
                            className={`block rounded-md px-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${isNavigationLinkActive(path, child.href) ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
                          >
                            {label(child.href, child.label)}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setOpen(false)}
                      aria-current={section === n ? "page" : undefined}
                      className="border-b py-4 font-medium"
                    >
                      {n.label}
                    </Link>
                  ),
                )}
                <Link
                  href="/account"
                  onClick={() => setOpen(false)}
                  className="py-4 font-medium"
                >
                  Account & security
                </Link>
                {!session.data?.authenticated && (
                  <Link
                    href="/auth"
                    onClick={() => setOpen(false)}
                    className="rounded-md bg-primary px-3 py-3 text-center text-primary-foreground"
                  >
                    Sign in
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
