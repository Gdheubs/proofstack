"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-auth";

// Pages a member may open before finishing the sign-up wizard.
const OPEN = [
  "/welcome",
  "/auth",
  "/about",
  "/terms",
  "/privacy",
  "/community-guidelines",
  "/contact",
  "/account",
  "/settings",
];

// Sends a new member to the wizard once, right after they agree to the terms.
export function OnboardingGate() {
  const session = useSession();
  const path = usePathname();
  const router = useRouter();
  const user = session.data?.user;
  const pending =
    !!session.data?.authenticated &&
    !!user?.onboardingRequired &&
    !user.agreementRequired &&
    !OPEN.some((p) => path === p || path.startsWith(p + "/"));
  useEffect(() => {
    if (pending) router.replace("/welcome");
  }, [pending, router]);
  return null;
}
