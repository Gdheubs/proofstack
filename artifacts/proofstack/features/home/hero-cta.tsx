"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-auth";

// The one primary action: sign up, or continue to your profile when signed in.
export function HeroCta() {
  const session = useSession();
  const signedIn = !!session.data?.authenticated;
  return (
    <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <Button size="lg" asChild className="w-full sm:w-auto">
        <Link href={signedIn ? "/profile/me" : "/auth?mode=signup"}>
          {signedIn ? "Go to your profile" : "Get started free"}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
      <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
        <Link href="/editor">Open the code editor</Link>
      </Button>
    </div>
  );
}
