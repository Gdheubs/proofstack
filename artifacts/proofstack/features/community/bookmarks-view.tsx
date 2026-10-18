"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCommunityList, useCsrf } from "@/hooks/use-community";
import { Empty, PageHead, QueryError } from "./ui";
import { Skeleton } from "@/features/auth/shared";
import { PostCard } from "./post-card";
import { ProjectCard } from "./project-card";

export function BookmarksView() {
  const { canAct } = useCsrf();
  const list = useCommunityList({ view: "bookmarks" }, canAct);
  if (!canAct)
    return (
      <Empty
        title="Sign in to see bookmarks"
        action={
          <Button asChild>
            <Link href="/auth">Sign in</Link>
          </Button>
        }
      />
    );
  const posts = list.pages.flatMap((p) => p.posts);
  const projects = list.pages.flatMap((p) => p.projects);
  return (
    <div>
      <PageHead eyebrow="Bookmarks" title="Saved for later" />
      {list.q.isPending ? (
        <Skeleton className="h-40" />
      ) : list.q.isError ? (
        <QueryError error={list.q.error} onRetry={() => list.q.refetch()} />
      ) : !posts.length && !projects.length ? (
        <Empty
          title="Nothing saved yet"
          body="Use Save on a post or project and it lands here."
          action={
            <Button asChild variant="outline">
              <Link href="/community">Browse the build log</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <section aria-label="Posts" className="space-y-4">
            <h2 className="font-serif text-xl">Posts</h2>
            {posts.length ? (
              posts.map((p) => <PostCard key={p.id} post={p} />)
            ) : (
              <Empty title="No saved posts" />
            )}
          </section>
          <section aria-label="Projects" className="space-y-4">
            <h2 className="font-serif text-xl">Projects</h2>
            {projects.length ? (
              projects.map((p) => <ProjectCard key={p.id} project={p} />)
            ) : (
              <Empty title="No saved projects" />
            )}
          </section>
          {list.q.hasNextPage && (
            <div className="col-span-full flex justify-center">
              <Button
                variant="outline"
                onClick={() => list.q.fetchNextPage()}
                disabled={list.q.isFetchingNextPage}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
