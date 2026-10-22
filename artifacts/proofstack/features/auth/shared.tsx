"use client";
import { useState, type ReactNode } from "react";
import { Check, Copy, TriangleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const PHONE_RE = /^\+[1-9]\d{6,14}$/;
export const CODE_RE = /^\d{6,10}$/;
export const passwordProblem = (p: string) =>
  p.length < 12
    ? "Use at least 12 characters."
    : new TextEncoder().encode(p).length > 72
      ? "Password must be 72 bytes or fewer."
      : null;

export const KINDS = [
  { value: "developer", label: "Developer", hint: "Ship work, collect proof" },
  {
    value: "recruiter",
    label: "Recruiter",
    hint: "Verify before you reach out",
  },
] as const;
export type Kind = (typeof KINDS)[number]["value"];

export function Panel({
  title,
  eyebrow,
  children,
  action,
  id,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="rounded-lg border bg-card p-5 sm:p-6 rise">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && (
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "ok" | "warn";
  children: ReactNode;
}) {
  const cls = {
    info: "border-border bg-muted/60",
    ok: "border-chart-3/50 bg-chart-3/10",
    warn: "border-accent/60 bg-accent/10",
    error: "border-destructive/50 bg-destructive/10 text-destructive",
  }[tone];
  const Icon = tone === "error" || tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex gap-2 rounded-md border px-3 py-2 text-sm ${cls}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  ...props
}: React.ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Input {...props} />
      {hint && (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export function CodeField({
  value,
  onChange,
  label = "Verification code",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <Field
      label={label}
      value={value}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={10}
      placeholder="6 to 10 digits"
      className="font-mono tracking-[0.3em]"
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
    />
  );
}

export function KindPicker({
  value,
  onChange,
}: {
  value: Kind;
  onChange: (k: Kind) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">Profile type</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {KINDS.map((k) => (
          <label
            key={k.value}
            className={`cursor-pointer rounded-md border p-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${value === k.value ? "border-primary bg-primary/5" : "hover:bg-muted/60"}`}
          >
            <input
              type="radio"
              name="kind"
              className="sr-only"
              checked={value === k.value}
              onChange={() => onChange(k.value)}
            />
            <span className="block font-medium">{k.label}</span>
            <span className="block text-xs text-muted-foreground">
              {k.hint}
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Profile type describes who you are. It never grants administrative
        access.
      </p>
    </fieldset>
  );
}

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {done ? "Copied" : label}
    </Button>
  );
}

export function Confirm({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-3">
      <Notice tone="error">{message}</Notice>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
