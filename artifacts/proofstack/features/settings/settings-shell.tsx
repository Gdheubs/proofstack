"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Briefcase,
  Building2,
  KeyRound,
  Link2,
  Palette,
  Shield,
  ShieldCheck,
  User,
  UserCog,
} from "lucide-react";
import { useSession } from "@/hooks/use-auth";

export const SETTINGS_SECTIONS = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/account", label: "Account", icon: UserCog },
  { href: "/settings/security", label: "Security", icon: KeyRound },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/career", label: "Career", icon: Briefcase },
  { href: "/settings/connections", label: "Connections", icon: Link2 },
  { href: "/settings/organizations", label: "Organizations", icon: Building2 },
  { href: "/settings/privacy", label: "Privacy & data", icon: Shield },
  { href: "/settings/appearance", label: "Appearance", icon: Palette },
  {
    href: "/settings/admin",
    label: "Administration",
    icon: ShieldCheck,
    admin: true,
  },
] as const;

// Settings as a map of the account: a list of topics on the left, one plain
// form per topic on the right. On phones the list scrolls horizontally.
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const session = useSession();
  const admin = !!session.data?.user?.platformRole;
  const sections = SETTINGS_SECTIONS.filter((s) => !("admin" in s) || admin);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-5 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
      <aside className="mb-6 lg:mb-0">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Settings
        </p>
        <nav aria-label="Settings sections">
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:px-0 lg:pb-0">
            {sections.map((s) => {
              const active = path === s.href || path.startsWith(s.href + "/");
              return (
                <li key={s.href} className="shrink-0">
                  <Link
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    <s.icon className="h-4 w-4" aria-hidden="true" />
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
