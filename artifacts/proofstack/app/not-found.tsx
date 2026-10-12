import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        404
      </p>
      <h1 className="mt-3 text-5xl font-semibold">No record of this page.</h1>
      <p className="mt-4 text-muted-foreground">
        The address does not match anything in Phase 1.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/">Overview</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/foundation">Foundation console</Link>
        </Button>
      </div>
    </div>
  );
}
