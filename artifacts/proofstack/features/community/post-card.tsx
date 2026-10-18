"use client";
import Link from "next/link";
import { useState } from "react";
import type { CommunityPost } from "@workspace/api-client-react";
import { Bookmark, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/features/auth/shared";
import { useCommunityRun, useCsrf } from "@/hooks/use-community";
import { ago } from "@/lib/community";
import { PersonAvatar, PersonLink, Tags } from "./ui";
import { Body } from "./body";
import { ReactionBar } from "./reactions";
import { PostDialog } from "./post-dialog";

export function PostCard({
  post,
  onDeleted,
}: {
  post: CommunityPost;
  onDeleted?: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const { run, pending } = useCommunityRun();
  const { canAct } = useCsrf();
  return (
    <article className="rounded-lg border bg-card p-4 sm:p-5 rise">
      <header className="flex items-start gap-3">
        <PersonAvatar person={post.author} />
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <PersonLink person={post.author} />
          <div className="flex items-center gap-1">
            <Link
              href={`/posts/${post.id}`}
              className="font-mono text-xs text-muted-foreground hover:underline"
            >
              {ago(post.createdAt)}
              {post.updatedAt !== post.createdAt && " · edited"}
            </Link>
            {post.canEdit && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit post"
                  onClick={() => setEdit(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete post"
                  onClick={() => setDel(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="mt-3 space-y-3">
        <Body text={post.body} mentions={post.mentions} />
        <Tags items={post.tags} />
      </div>
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ReactionBar
          reactions={post.reactions}
          targetId={post.id}
          targetType="post"
        />
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/posts/${post.id}`}>
              <MessageSquare className="h-4 w-4" />
              {post.commentCount}{" "}
              {post.commentCount === 1 ? "comment" : "comments"}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={post.bookmarked}
            disabled={pending || !canAct}
            title={canAct ? undefined : "Sign in to bookmark"}
            onClick={() =>
              run(
                {
                  action: "bookmark",
                  targetId: post.id,
                  targetType: "post",
                  enabled: !post.bookmarked,
                },
                post.bookmarked ? "Bookmark removed." : "Saved to bookmarks.",
              )
            }
          >
            <Bookmark
              className={`h-4 w-4 ${post.bookmarked ? "fill-accent text-accent" : ""}`}
            />
            {post.bookmarked ? "Saved" : "Save"}
          </Button>
        </div>
      </footer>
      <PostDialog open={edit} onOpenChange={setEdit} post={post} />
      <Confirm
        open={del}
        title="Delete this post?"
        description="The post and its comments will be removed. This cannot be undone."
        confirmLabel="Delete post"
        onCancel={() => setDel(false)}
        onConfirm={async () => {
          setDel(false);
          const r = await run(
            { action: "post-delete", id: post.id },
            "Post deleted.",
          );
          if (r) onDeleted?.();
        }}
      />
    </article>
  );
}
