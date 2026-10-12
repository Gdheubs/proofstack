"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getGetCommunityQueryKey,
  useGetCommunity,
  type CommunityComment,
} from "@workspace/api-client-react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton, Confirm } from "@/components/auth/shared";
import { useCommunityRun, useCsrf } from "@/hooks/use-community";
import { ago, errStatus } from "@/lib/community";
import { Empty, PersonAvatar, PersonLink, QueryError } from "./ui";
import { Body } from "./body";
import { PostCard } from "./post-card";
import { ReactionBar } from "./reactions";

function CommentItem({ c }: { c: CommunityComment }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(c.body);
  const [del, setDel] = useState(false);
  const { run, pending } = useCommunityRun();
  return (
    <li className="flex gap-3 border-t py-4 first:border-t-0">
      <PersonAvatar person={c.author} size={34} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <PersonLink person={c.author} />
            <span className="font-mono text-xs text-muted-foreground">
              {ago(c.createdAt)}
              {c.updatedAt !== c.createdAt && " · edited"}
            </span>
          </div>
          {c.canEdit && !edit && (
            <div className="flex">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Edit comment"
                onClick={() => {
                  setText(c.body);
                  setEdit(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete comment"
                onClick={() => setDel(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        {edit ? (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run(
                {
                  action: "comment-save",
                  id: c.id,
                  targetId: c.postId,
                  body: text.trim(),
                },
                "Comment updated.",
              );
              if (r) setEdit(false);
            }}
          >
            <Textarea
              aria-label="Edit comment"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              required
              maxLength={2000}
            />
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={pending}>
                Save
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setEdit(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Body text={c.body} mentions={c.mentions} />
        )}
        <ReactionBar
          reactions={c.reactions}
          targetId={c.id}
          targetType="comment"
        />
      </div>
      <Confirm
        open={del}
        title="Delete this comment?"
        description="This cannot be undone."
        confirmLabel="Delete comment"
        onCancel={() => setDel(false)}
        onConfirm={() => {
          setDel(false);
          void run({ action: "comment-delete", id: c.id }, "Comment deleted.");
        }}
      />
    </li>
  );
}

export function PostView({ id }: { id: string }) {
  const router = useRouter();
  const params = { view: "post", id } as const;
  const q = useGetCommunity(params, {
    query: { queryKey: getGetCommunityQueryKey(params) },
  });
  const { run, pending, error } = useCommunityRun();
  const { canAct } = useCsrf();
  const [body, setBody] = useState("");
  const post = q.data?.post;
  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/community">Back to build log</Link>
      </Button>
      {q.isPending ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        errStatus(q.error) === 404 ? (
          <Empty title="Post not found" body="It may have been deleted." />
        ) : (
          <QueryError error={q.error} onRetry={() => q.refetch()} />
        )
      ) : !post ? (
        <Empty title="Post not found" body="It may have been deleted." />
      ) : (
        <div className="space-y-6">
          <PostCard post={post} onDeleted={() => router.push("/community")} />
          <section
            aria-labelledby="comments"
            className="rounded-lg border bg-card p-4 sm:p-5"
          >
            <h2 id="comments" className="mb-3 text-xl font-semibold">
              Comments ({post.commentCount})
            </h2>
            {canAct ? (
              <form
                className="mb-4 space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await run(
                    {
                      action: "comment-save",
                      targetId: post.id,
                      body: body.trim(),
                    },
                    "Comment added.",
                  );
                  if (r) setBody("");
                }}
              >
                <Textarea
                  aria-label="Add a comment"
                  required
                  rows={3}
                  maxLength={2000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Add to the thread. Use @handle to mention someone."
                />
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={pending || !body.trim()}>
                  Comment
                </Button>
              </form>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">
                <Link className="underline" href="/auth">
                  Sign in
                </Link>{" "}
                to join the conversation.
              </p>
            )}
            {post.comments.length ? (
              <ul>
                {post.comments.map((c) => (
                  <CommentItem key={c.id} c={c} />
                ))}
              </ul>
            ) : (
              <Empty
                title="No comments yet"
                body="Start the thread with a question or a note of thanks."
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
