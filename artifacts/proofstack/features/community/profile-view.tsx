"use client";
import Link from "next/link";
import { useState } from "react";
import {
  getGetCommunityQueryKey,
  useGetCommunity,
} from "@workspace/api-client-react";
import { MapPin, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/features/auth/shared";
import { useCommunityList } from "@/hooks/use-community";
import { ago, errStatus, ENTRY_KINDS } from "@/lib/community";
import { Empty, PagedList, PersonAvatar, QueryError, Tags } from "./ui";
import { FollowButton, PersonCard } from "./people";
import { EntryList } from "./entry-list";
import { ProjectCard } from "./project-card";
import { ProfileAssessmentResults } from "../assessments/profile-assessment-results";

function ProjectsTab({ handle, isMe }: { handle: string; isMe: boolean }) {
  const list = useCommunityList({ view: "profile", handle });
  return (
    <PagedList
      list={list}
      pick={(page) => page.projects}
      className="grid gap-4 sm:grid-cols-2"
      render={(project) => <ProjectCard project={project} />}
      empty={
        <Empty
          title="No public projects yet"
          action={
            isMe ? (
              <Button asChild>
                <Link href="/projects">Create a project</Link>
              </Button>
            ) : undefined
          }
        />
      }
    />
  );
}

function PeopleTab({
  handle,
  filter,
}: {
  handle: string;
  filter: "followers" | "following-list";
}) {
  const list = useCommunityList({ view: "profile", handle, filter });
  return (
    <PagedList
      list={list}
      pick={(p) => p.people}
      className="grid gap-3 sm:grid-cols-2"
      render={(p) => <PersonCard person={p} />}
      empty={
        <Empty
          title={
            filter === "followers"
              ? "No followers yet"
              : "Not following anyone yet"
          }
        />
      }
    />
  );
}

export function ProfileView({ handle }: { handle: string }) {
  const params = { view: "profile", handle } as const;
  const q = useGetCommunity(params, {
    query: { queryKey: getGetCommunityQueryKey(params) },
  });
  const [tab, setTab] = useState("evidence");
  const data = q.data;
  const p = data?.profile;
  if (q.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-44" />
        <Skeleton className="h-64" />
      </div>
    );
  if (q.isError)
    return errStatus(q.error) === 404 ? (
      <Empty
        title={`No profile at @${handle}`}
        body="Nobody has claimed this handle yet."
        action={
          <Button asChild variant="outline">
            <Link href="/search?type=developers">Search developers</Link>
          </Button>
        }
      />
    ) : (
      <QueryError error={q.error} onRetry={() => q.refetch()} />
    );
  if (!p)
    return (
      <Empty
        title={
          handle === "me"
            ? "You have not claimed a handle yet"
            : `No profile at @${handle}`
        }
        body={
          handle === "me"
            ? "Claim a handle to start your public profile."
            : "Nobody has claimed this handle yet."
        }
        action={
          handle === "me" ? (
            <Button asChild>
              <Link href="/settings/profile">Claim your handle</Link>
            </Button>
          ) : undefined
        }
      />
    );
  const entries = data.entries;
  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-card p-5 sm:p-7 rise">
        <div className="flex flex-col gap-5 sm:flex-row">
          <PersonAvatar person={p} size={96} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold">{p.displayName}</h1>
                <p className="font-mono text-sm text-muted-foreground">
                  @{p.handle} · {p.kind}
                </p>
              </div>
              <div className="flex gap-2">
                {p.isMe && (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/profile">
                      <Settings className="h-4 w-4" /> Edit profile
                    </Link>
                  </Button>
                )}
                <FollowButton person={p} />
              </div>
            </div>
            {p.bio && <p className="max-w-2xl whitespace-pre-wrap">{p.bio}</p>}
            {p.location && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {p.location}
              </p>
            )}
            <Tags items={p.skills} skill />
            <p className="font-mono text-xs text-muted-foreground">
              <button
                className="underline-offset-2 hover:underline"
                onClick={() => setTab("followers")}
              >
                {p.followers} followers
              </button>{" "}
              ·{" "}
              <button
                className="underline-offset-2 hover:underline"
                onClick={() => setTab("following")}
              >
                {p.following} following
              </button>
            </p>
          </div>
        </div>
      </section>

      <ProfileAssessmentResults
        handle={p.handle || (p.isMe ? "me" : "")}
        ownerId={p.id}
        isMe={p.isMe}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="evidence">Evidence & experience</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="followers">Followers</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
        </TabsList>
        <TabsContent value="evidence" className="mt-5">
          <p className="mb-4 text-sm text-muted-foreground">
            Each record shows where it comes from. Linked evidence points to a
            public URL; self-reported records are the person&apos;s own words.
            Neither is a score.
          </p>
          <EntryList
            entries={entries}
            kinds={ENTRY_KINDS.personal}
            canAdd={p.isMe}
          />
        </TabsContent>
        <TabsContent value="projects" className="mt-5">
          <ProjectsTab handle={p.handle || handle} isMe={p.isMe} />
        </TabsContent>
        <TabsContent value="activity" className="mt-5">
          {data.activity.length ? (
            <ol className="space-y-2 border-l-2 pl-4">
              {data.activity.map((a) => (
                <li key={a.id} className="text-sm">
                  <Link href={a.href} className="font-medium hover:underline">
                    {a.title}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {a.type} · {ago(a.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="No activity yet" />
          )}
        </TabsContent>
        <TabsContent value="followers" className="mt-5">
          {tab === "followers" && (
            <PeopleTab handle={p.handle} filter="followers" />
          )}
        </TabsContent>
        <TabsContent value="following" className="mt-5">
          {tab === "following" && (
            <PeopleTab handle={p.handle} filter="following-list" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
