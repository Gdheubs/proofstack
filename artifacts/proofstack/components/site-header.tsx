"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Bell,
  Bookmark,
  Briefcase,
  Code2,
  FolderKanban,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  User,
  Users,
} from "lucide-react";
import { useAct, useSession } from "@/hooks/use-auth";
import { useViewer } from "@/hooks/use-viewer";
import {
  NAV,
  PROFILE_MENU,
  getNavigationSection,
  pathMatches,
} from "@/lib/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PersonAvatar } from "@/features/community/ui";

const ICONS: Record<string, typeof Home> = {
  "/home": Home,
  "/projects": FolderKanban,
  "/code": Code2,
  "/organizations": Users,
  "/opportunities": Briefcase,
  "/talent": Sparkles,
  "/assessments": GraduationCap,
};
const MENU_ICONS: Record<string, typeof Home> = {
  "/profile/me": User,
  "/bookmarks": Bookmark,
  "/settings": Settings,
};

function SearchBox({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(
          q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search",
        );
      }}
    >
      <label className="relative block">
        <span className="sr-only">Search people, projects and posts</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="h-9 w-44 rounded-md border bg-background pl-8 pr-3 text-sm transition-[width] focus:w-64 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring xl:w-56"
        />
      </label>
    </form>
  );
}

function ThemeItem() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        setTheme(dark ? "light" : "dark");
      }}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {dark ? "Light mode" : "Dark mode"}
    </DropdownMenuItem>
  );
}

function ProfileMenu() {
  const { viewer } = useViewer();
  const session = useSession();
  const { act } = useAct();
  const router = useRouter();
  const name = viewer?.displayName ?? session.data?.user?.displayName ?? "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open your menu"
          className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <PersonAvatar
            person={{
              displayName: name || "?",
              avatarPath: viewer?.avatarPath ?? "",
            }}
            size={34}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuLabel className="truncate">
          {name}
          {viewer?.handle && (
            <span className="block truncate text-xs font-normal text-muted-foreground">
              @{viewer.handle}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PROFILE_MENU.map((item) => {
          const Icon = MENU_ICONS[item.href] ?? User;
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <ThemeItem />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            act({ action: "logout", scope: "local" })
              .catch(() => {})
              .finally(() => router.push("/"))
          }
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const section = getNavigationSection(path);
  const session = useSession();
  const signedIn = !!session.data?.authenticated;
  const { unread } = useViewer();
  const navClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

  if (!signedIn)
    return (
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="ProofStack home">
            <Logo />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link href="/auth" className={navClass(path === "/auth")}>
              Log in
            </Link>
            <Button asChild size="sm">
              <Link href="/auth?mode=signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>
    );

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-5">
        <Link href="/home" aria-label="ProofStack home" className="shrink-0">
          <Logo />
        </Link>
        <nav
          aria-label="Primary"
          className="hidden items-center gap-0.5 lg:flex"
        >
          {NAV.map((n) => {
            const Icon = ICONS[n.href] ?? Home;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={section === n ? "page" : undefined}
                className={navClass(section === n)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <SearchBox className="hidden md:block" />
          <Link
            href="/search"
            aria-label="Search"
            className={`${navClass(pathMatches(path, "/search"))} md:hidden`}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link
            href="/notifications"
            aria-label={
              unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
            }
            aria-current={
              pathMatches(path, "/notifications") ? "page" : undefined
            }
            className={`relative inline-flex h-9 w-9 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${pathMatches(path, "/notifications") ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unread > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 min-w-[1.125rem] rounded-full bg-accent px-1 text-center font-mono text-[10px] leading-[1.125rem] text-accent-foreground"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <ProfileMenu />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                className="lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Workspace</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="mt-4 flex flex-col px-4 pb-6">
                {NAV.map((n) => {
                  const Icon = ICONS[n.href] ?? Home;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setOpen(false)}
                      aria-current={section === n ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-3 border-b py-3 ${section === n ? "font-medium" : ""}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      {n.label}
                    </Link>
                  );
                })}
                {PROFILE_MENU.map((item) => {
                  const Icon = MENU_ICONS[item.href] ?? User;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-12 items-center gap-3 border-b py-3 text-muted-foreground"
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
