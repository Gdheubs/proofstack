"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-auth";

// Members skip the marketing page and land on their feed.
export function LandingRedirect() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session.data?.authenticated) router.replace("/home");
  }, [session.data?.authenticated, router]);
  return null;
}

export function HeroCta() {
  return (
    <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <Button size="lg" asChild className="w-full sm:w-auto">
        <Link href="/auth?mode=signup">
          Get started free
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
      <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
        <Link href="/auth">Log in</Link>
      </Button>
    </div>
  );
}
