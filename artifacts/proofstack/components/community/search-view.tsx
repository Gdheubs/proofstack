"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/auth/shared";
import { useCommunityList } from "@/hooks/use-community";
import { Empty, PageHead, QueryError } from "./ui";
import { OrgCard } from "./orgs-view";
import { PersonCard } from "./people";
import { PostCard } from "./post-card";
import { ProjectCard } from "./project-card";

const TYPES = [
  "all",
  "developers",
  "projects",
  "organizations",
  "posts",
  "skills",
] as const;
type T = (typeof TYPES)[number];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-xl">{title}</h2>
      {children}
    </section>
  );
}

export function SearchView() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const q = sp.get("q") ?? "";
  const rawType = sp.get("type") as T;
  const type: T = TYPES.includes(rawType) ? rawType : "all";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const go = (nq: string, nt: T) =>
    router.push(
      `${path}?${new URLSearchParams({ ...(nq ? { q: nq } : {}), type: nt })}`,
    );
  const list = useCommunityList(
    { view: "search", q, type },
    q.trim().length > 0,
  );
  const pages = list.pages;
  const uniq = <X extends { id: string }>(xs: X[]) =>
    Array.from(new Map(xs.map((x) => [x.id, x])).values());
  const people = uniq(pages.flatMap((p) => p.people));
  const projects = uniq(pages.flatMap((p) => p.projects));
  const orgs = uniq(pages.flatMap((p) => p.organizations));
  const posts = uniq(pages.flatMap((p) => p.posts));
  const skills = Array.from(new Set(pages.flatMap((p) => p.skills)));
  const total =
    people.length +
    projects.length +
    orgs.length +
    posts.length +
    skills.length;
  return (
    <div>
      <PageHead eyebrow="Search" title="Find people and work" />
      <form
        role="search"
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(text.trim(), type);
        }}
      >
        <Input
          aria-label="Search query"
          value={text}
          maxLength={100}
          onChange={(e) => setText(e.target.value)}
          placeholder="A skill, a handle, a project..."
        />
        <Button type="submit">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>
      <Tabs value={type} onValueChange={(v) => go(q, v as T)} className="mb-6">
        <TabsList className="h-auto flex-wrap justify-start">
          {TYPES.map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {!q.trim() ? (
        <Empty
          title="Search ProofStack"
          body="Developers, projects, organizations, posts and skills. Tap a skill to see the developers listing it."
        />
      ) : list.q.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : list.q.isError ? (
        <QueryError error={list.q.error} onRetry={() => list.q.refetch()} />
      ) : !total ? (
        <Empty
          title={`Nothing matched "${q}"`}
          body="Try a shorter term or a different type."
        />
      ) : (
        <div className="space-y-8">
          {skills.length > 0 && (
            <Section title="Skills">
              <ul className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <li key={s}>
                    <Link
                      href={`/search?type=developers&q=${encodeURIComponent(s)}`}
                      className="rounded-full border bg-card px-3 py-1 font-mono text-sm transition-colors hover:border-accent hover:bg-accent/15"
                    >
                      {s}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Skills are self-reported. Selecting one lists developers who
                name it.
              </p>
            </Section>
          )}
          {people.length > 0 && (
            <Section title="Developers">
              <div className="grid gap-3 sm:grid-cols-2">
                {people.map((p) => (
                  <PersonCard key={p.id} person={p} />
                ))}
              </div>
            </Section>
          )}
          {projects.length > 0 && (
            <Section title="Projects">
              <div className="grid gap-4 sm:grid-cols-2">
                {projects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </Section>
          )}
          {orgs.length > 0 && (
            <Section title="Organizations">
              <div className="grid gap-4 sm:grid-cols-2">
                {orgs.map((o) => (
                  <OrgCard key={o.id} org={o} />
                ))}
              </div>
            </Section>
          )}
          {posts.length > 0 && (
            <Section title="Posts">
              <div className="max-w-2xl space-y-4">
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </div>
            </Section>
          )}
          {list.q.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => list.q.fetchNextPage()}
                disabled={list.q.isFetchingNextPage}
              >
                {list.q.isFetchingNextPage ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
