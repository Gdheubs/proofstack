"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getGetCommunityQueryKey,
  useGetCommunity,
} from "@workspace/api-client-react";
import { Bookmark, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Confirm, Skeleton } from "@/features/auth/shared";
import { useCommunityRun, useCsrf } from "@/hooks/use-community";
import { assetUrl, errStatus } from "@/lib/community";
import { Empty, PersonAvatar, PersonLink, QueryError, Tags } from "./ui";
import { Contributors } from "./contributors";
import { EntryList } from "./entry-list";
import { ProjectDialog } from "./project-dialog";

export function ProjectView({ slug }: { slug: string }) {
  const router = useRouter();
  const params = { view: "project", handle: slug } as const;
  const q = useGetCommunity(params, {
    query: { queryKey: getGetCommunityQueryKey(params) },
  });
  const { run } = useCommunityRun();
  const { canAct } = useCsrf();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const p = q.data?.project;
  if (q.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-60" />
      </div>
    );
  if (q.isError)
    return errStatus(q.error) === 404 ? (
      <Empty
        title="Project not found"
        body="It may be private to an organization or removed."
        action={
          <Button asChild variant="outline">
            <Link href="/projects">All projects</Link>
          </Button>
        }
      />
    ) : (
      <QueryError error={q.error} onRetry={() => q.refetch()} />
    );
  if (!p) return <Empty title="Project not found" />;
  const scope = { projectId: p.id };
  const canAdd = p.canEdit || p.canContribute;
  return (
    <div className="space-y-8">
      <header className="space-y-4 rise">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Project
              {p.visibility === "organization" ? " · organization only" : ""}
            </p>
            <h1 className="text-3xl font-semibold sm:text-4xl">{p.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/repositories?project=${p.id}`}>
                Hosted repository
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/work/${p.id}`}>Work board</Link>
            </Button>
            {canAct && (
              <Button
                variant="outline"
                size="sm"
                aria-pressed={p.bookmarked}
                onClick={() =>
                  run(
                    {
                      action: "bookmark",
                      targetId: p.id,
                      targetType: "project",
                      enabled: !p.bookmarked,
                    },
                    p.bookmarked ? "Bookmark removed." : "Saved to bookmarks.",
                  )
                }
              >
                <Bookmark
                  className={`h-4 w-4 ${p.bookmarked ? "fill-accent text-accent" : ""}`}
                />
                {p.bookmarked ? "Saved" : "Save"}
              </Button>
            )}
            {p.canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEdit(true)}
                >
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDel(true)}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PersonAvatar person={p.owner} size={28} />
          <PersonLink person={p.owner} />
        </div>
        {p.description && (
          <p className="max-w-3xl whitespace-pre-wrap leading-relaxed">
            {p.description}
          </p>
        )}
        <Tags items={p.technologies} />
        <div className="flex flex-wrap gap-4 text-sm">
          {p.demoUrl && (
            <a
              className="inline-flex items-center gap-1 underline underline-offset-2"
              href={p.demoUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              <ExternalLink className="h-4 w-4" />
              Live demo
            </a>
          )}
          {p.repositoryUrl && (
            <a
              className="inline-flex items-center gap-1 underline underline-offset-2"
              href={p.repositoryUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              <ExternalLink className="h-4 w-4" />
              Repository (manual link)
            </a>
          )}
        </div>
      </header>
      {p.screenshots.length > 0 && (
        <ul
          className="flex snap-x gap-3 overflow-x-auto pb-2"
          aria-label="Screenshots"
        >
          {p.screenshots.map((s) => (
            <li key={s} className="w-[80%] shrink-0 snap-start sm:w-[45%]">
              <img
                src={assetUrl(s)}
                alt={`${p.title} screenshot`}
                loading="lazy"
                className="aspect-video w-full rounded-lg border object-cover"
              />
            </li>
          ))}
        </ul>
      )}
      <Tabs defaultValue="releases">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="releases">Release records</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="repos">Repository links</TabsTrigger>
          <TabsTrigger value="people">Contributors</TabsTrigger>
        </TabsList>
        {(
          [
            "releases:release",
            "docs:documentation",
            "evidence:evidence",
            "repos:repository",
          ] as const
        ).map((t) => {
          const [v, kind] = t.split(":");
          return (
            <TabsContent key={v} value={v} className="mt-5">
              {kind === "release" && (
                <p className="mb-4 text-sm text-muted-foreground">
                  Manual release records describe this project&apos;s
                  milestones. Git releases are managed separately in the hosted
                  repository.
                </p>
              )}
              {kind === "repository" && (
                <p className="mb-4 text-sm text-muted-foreground">
                  Manual repository links point to source hosted elsewhere; they
                  are not hosted Git repositories on ProofStack.
                </p>
              )}
              <EntryList
                entries={p.entries}
                kinds={[kind]}
                scope={scope}
                canAdd={canAdd}
              />
            </TabsContent>
          );
        })}
        <TabsContent value="people" className="mt-5">
          <Contributors project={p} />
        </TabsContent>
      </Tabs>
      <ProjectDialog open={edit} onOpenChange={setEdit} project={p} />
      <Confirm
        open={del}
        title={`Delete ${p.title}?`}
        description="The project, its records and contributor links are removed permanently."
        confirmLabel="Delete project"
        onCancel={() => setDel(false)}
        onConfirm={async () => {
          setDel(false);
          if (
            await run(
              { action: "project-delete", id: p.id },
              "Project deleted.",
            )
          )
            router.push("/projects");
        }}
      />
    </div>
  );
}
