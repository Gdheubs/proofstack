import { cn } from "@/lib/utils";

export type Tone = "ok" | "bad" | "pending" | "off";
const toneCls: Record<Tone, string> = {
  ok: "bg-[hsl(var(--chart-3))]",
  bad: "bg-destructive",
  pending: "bg-accent",
  off: "bg-muted-foreground",
};

export function StatusPill({
  tone,
  label,
  className,
}: {
  tone: Tone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 font-mono text-xs",
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        {(tone === "ok" || tone === "pending") && (
          <span
            className={cn(
              "pulse-ring absolute inset-0 rounded-full",
              toneCls[tone],
            )}
          />
        )}
        <span className={cn("relative h-2 w-2 rounded-full", toneCls[tone])} />
      </span>
      {label}
    </span>
  );
}
