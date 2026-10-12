import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-6 px-5 py-16"
      role="status"
      aria-label="Loading page"
    >
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-16 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <div className="grid gap-4 pt-6 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
