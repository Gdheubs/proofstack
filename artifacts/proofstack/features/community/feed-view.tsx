"use client";
import Link from "next/link";
import { useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommunityList, useCsrf } from "@/hooks/use-community";
import { useViewer } from "@/hooks/use-viewer";
import { Empty, PageHead, PagedList, PersonAvatar } from "./ui";
import { PostCard } from "./post-card";
import { PostDialog } from "./post-dialog";

// embedded: rendered inside the home page's columns, without its own width.
export function FeedView({ embedded = false }: { embedded?: boolean }) {
  const [filter, setFilter] = useState<"discover" | "following">("discover");
  const [compose, setCompose] = useState(false);
  const { canAct } = useCsrf();
  const { viewer } = useViewer();
  const list = useCommunityList(
    { view: "feed", filter },
    filter === "discover" || canAct,
  );
  return (
    <div className={embedded ? "" : "mx-auto max-w-2xl"}>
      <PageHead eyebrow="Feed" title="What builders are shipping">
        {!canAct && (
          <Button asChild variant="outline">
            <Link href="/auth">Sign in to post</Link>
          </Button>
        )}
      </PageHead>
      {canAct && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border bg-card p-3">
          <PersonAvatar
            person={{
              displayName: viewer?.displayName ?? "?",
              avatarPath: viewer?.avatarPath ?? "",
            }}
          />
          <button
            type="button"
            onClick={() => setCompose(true)}
            className="flex min-h-10 flex-1 items-center gap-2 rounded-full border bg-background px-4 text-left text-sm text-muted-foreground hover:bg-muted"
          >
            <PenLine aria-hidden="true" className="h-4 w-4" />
            Share what you are building…
          </button>
        </div>
      )}
      <Tabs
        value={filter}
        onValueChange={(v) => setFilter(v as typeof filter)}
        className="mb-5"
      >
        <TabsList>
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
        </TabsList>
      </Tabs>
      {filter === "following" && !canAct ? (
        <Empty
          title="Following is a signed-in view"
          body="Sign in to see updates from people you follow, newest first."
          action={
            <Button asChild>
              <Link href="/auth">Sign in</Link>
            </Button>
          }
        />
      ) : (
        <PagedList
          list={list}
          pick={(p) => p.posts}
          render={(post) => <PostCard post={post} />}
          empty={
            <Empty
              title={
                filter === "following"
                  ? "Nothing from people you follow yet"
                  : "No updates yet"
              }
              body={
                filter === "following"
                  ? "Follow a few builders and their updates land here in chronological order."
                  : "Be the first to show what you are working on."
              }
              action={
                filter === "following" ? (
                  <Button asChild variant="outline">
                    <Link href="/search?type=developers">Find developers</Link>
                  </Button>
                ) : canAct ? (
                  <Button onClick={() => setCompose(true)}>
                    Share an update
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}
      <PostDialog open={compose} onOpenChange={setCompose} />
    </div>
  );
}
