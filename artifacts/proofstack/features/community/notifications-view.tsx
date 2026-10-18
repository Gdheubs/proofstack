"use client";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCommunityList,
  useCommunityRun,
  useCsrf,
} from "@/hooks/use-community";
import { ago } from "@/lib/community";
import { Empty, PageHead, PagedList } from "./ui";

export function NotificationsView() {
  const { canAct } = useCsrf();
  const list = useCommunityList({ view: "notifications" }, canAct);
  const { run, pending } = useCommunityRun();
  const unread = list.pages[0]?.unreadCount ?? 0;
  if (!canAct)
    return (
      <Empty
        title="Sign in to see notifications"
        action={
          <Button asChild>
            <Link href="/auth">Sign in</Link>
          </Button>
        }
      />
    );
  return (
    <div className="mx-auto max-w-2xl">
      <PageHead
        eyebrow="Notifications"
        title={unread ? `${unread} unread` : "All caught up"}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={!unread || pending}
          onClick={() =>
            run({ action: "notification-read" }, "All marked as read.")
          }
        >
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </PageHead>
      <PagedList
        list={list}
        pick={(p) => p.notifications}
        className="space-y-2"
        empty={
          <Empty
            title="Nothing here yet"
            body="Mentions, replies, follows and project invitations will show up here."
          />
        }
        render={(n) => {
          const invite =
            /invit/i.test(n.title + n.body) && n.href.startsWith("/projects/");
          return (
            <div
              className={`flex items-start gap-3 rounded-lg border p-4 ${n.read ? "bg-card/60" : "border-accent/60 bg-accent/10"}`}
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-accent"}`}
                aria-label={n.read ? "Read" : "Unread"}
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={n.href}
                  className="font-medium hover:underline"
                  onClick={() =>
                    !n.read && run({ action: "notification-read", id: n.id })
                  }
                >
                  {n.title}
                </Link>
                <p className="text-sm text-muted-foreground">{n.body}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {ago(n.createdAt)}
                </p>
                {invite && (
                  <Button asChild size="sm" className="mt-2">
                    <Link href={n.href}>Review and respond</Link>
                  </Button>
                )}
              </div>
              {!n.read && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      { action: "notification-read", id: n.id },
                      "Marked as read.",
                    )
                  }
                >
                  Mark read
                </Button>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
