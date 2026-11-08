import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        404
      </p>
      <h1 className="mt-3 text-5xl font-semibold">Page not found.</h1>
      <p className="mt-4 text-muted-foreground">
        This address does not exist, or the page has moved.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/">Go to the home page</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/opportunities">Browse opportunities</Link>
        </Button>
      </div>
    </div>
  );
}
