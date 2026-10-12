"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24">
      <p className="font-mono text-xs uppercase tracking-widest text-destructive">
        Unexpected error
      </p>
      <h1 className="mt-3 text-4xl font-semibold">
        This page failed to render.
      </h1>
      <p className="mt-4 text-muted-foreground">
        {error.message || "Something went wrong."}
        {error.digest ? ` (ref ${error.digest})` : ""}
      </p>
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to overview</Link>
        </Button>
      </div>
    </div>
  );
}
