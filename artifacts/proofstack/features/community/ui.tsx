"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CommunityPerson } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorBlock, Notice, Skeleton } from "@/features/auth/shared";
import { assetUrl, errStatus, initials } from "@/lib/community";
import { errInfo } from "@/hooks/use-auth";
import type { CommunityList } from "@/hooks/use-community";

export function PageHead({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 rise">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ledger rounded-lg border border-dashed bg-card/60 px-6 py-10 text-center">
      <p className="font-serif text-xl">{title}</p>
      {body && (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {body}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function QueryError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  if (errStatus(error) === 401)
    return (
      <Empty
        title="Sign in to see this"
        body="This view is private. Sign in and finish multi-factor verification to continue."
        action={
          <Button asChild>
            <Link href="/auth">Sign in</Link>
          </Button>
        }
      />
    );
  return <ErrorBlock message={errInfo(error).message} onRetry={onRetry} />;
}

export function PersonAvatar({
  person,
  size = 40,
}: {
  person: Pick<CommunityPerson, "displayName" | "avatarPath">;
  size?: number;
}) {
  return (
    <Avatar style={{ width: size, height: size }} className="shrink-0">
      {person.avatarPath && (
        <AvatarImage src={assetUrl(person.avatarPath)} alt="" />
      )}
      <AvatarFallback className="bg-primary/10 font-mono text-xs">
        {initials(person.displayName)}
      </AvatarFallback>
    </Avatar>
  );
}

export function PersonLink({ person }: { person: CommunityPerson }) {
  return (
    <Link
      href={`/profile/${person.handle}`}
      className="group min-w-0 leading-tight"
    >
      <span className="block truncate font-medium group-hover:underline">
        {person.displayName}
      </span>
      <span className="block truncate font-mono text-xs text-muted-foreground">
        @{person.handle}
      </span>
    </Link>
  );
}

export function Tags({ items, skill }: { items: string[]; skill?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <li key={t}>
          {skill ? (
            <Link
              href={`/search?type=developers&q=${encodeURIComponent(t)}`}
              className="rounded-full border bg-muted/60 px-2.5 py-0.5 font-mono text-xs transition-colors hover:border-accent hover:bg-accent/15"
            >
              {t}
            </Link>
          ) : (
            <span className="rounded-full border bg-muted/60 px-2.5 py-0.5 font-mono text-xs">
              {t}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SourceBadge({ label }: { label: string }) {
  const tone =
    label === "Linked evidence"
      ? "border-chart-3/60 bg-chart-3/10"
      : label === "AI-assisted"
        ? "border-accent/70 bg-accent/10"
        : "border-border bg-muted/60";
  return (
    <span
      title="A label describing where this record comes from. It is not a verification or score."
      className={`stamp inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  );
}

export function PagedList<T extends { id: string }>({
  list,
  pick,
  render,
  empty,
  className = "space-y-4",
}: {
  list: CommunityList;
  pick: (page: CommunityList["pages"][number]) => T[];
  render: (item: T) => ReactNode;
  empty: ReactNode;
  className?: string;
}) {
  const { q, pages } = list;
  if (q.isPending)
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  if (q.isError)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const seen = new Set<string>();
  const items = pages
    .flatMap(pick)
    .filter((i) => !seen.has(i.id) && seen.add(i.id));
  if (!items.length) return <>{empty}</>;
  return (
    <>
      <div className={className}>
        {items.map((i) => (
          <div key={i.id} className="contents">
            {render(i)}
          </div>
        ))}
      </div>
      {q.hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
          >
            {q.isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  pending,
  error,
  errorExtra,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  pending?: boolean;
  error?: string | null;
  errorExtra?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-h-[90dvh] overflow-y-auto ${wide ? "sm:max-w-2xl" : ""}`}
      >
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          {error && (
            <Notice tone="error">
              {error} {errorExtra}
            </Notice>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Fld({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export const selectCls =
  "h-9 w-full rounded-md border bg-background px-2.5 text-sm focus-visible:outline-2";
