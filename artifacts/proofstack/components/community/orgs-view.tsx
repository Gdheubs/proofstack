"use client";
import Link from "next/link";
import { useState } from "react";
import { Building2, Plus } from "lucide-react";
import type { CommunityOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommunityList, useCsrf } from "@/hooks/use-community";
import { roleLabel } from "@/lib/community";
import { Empty, PageHead, PagedList } from "./ui";
import { OrgDialog } from "./org-dialog";

export function OrgCard({ org }: { org: CommunityOrganization }) {
  return (
    <article className="relative flex gap-3 rounded-lg border bg-card p-4 transition-shadow hover:shadow-md">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary/10">
        <Building2 className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="font-semibold">
          <Link
            href={`/organizations/${org.slug}`}
            className="after:absolute after:inset-0 hover:underline"
          >
            {org.name}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {org.description || "No description."}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {org.visibility} · {org.memberCount} members
          {org.myRole ? ` · you: ${roleLabel(org.myRole)}` : ""}
        </p>
      </div>
    </article>
  );
}

export function OrgsView() {
  const [filter, setFilter] = useState<"discover" | "mine">("discover");
  const [create, setCreate] = useState(false);
  const { canAct } = useCsrf();
  const list = useCommunityList(
    { view: "organizations", filter },
    filter === "discover" || canAct,
  );
  return (
    <div>
      <PageHead eyebrow="Organizations" title="Teams that build together">
        {canAct ? (
          <Button onClick={() => setCreate(true)}>
            <Plus className="h-4 w-4" /> New organization
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/auth">Sign in to create</Link>
          </Button>
        )}
      </PageHead>
      <Tabs
        value={filter}
        onValueChange={(v) => setFilter(v as typeof filter)}
        className="mb-5"
      >
        <TabsList>
          <TabsTrigger value="discover">Everyone</TabsTrigger>
          <TabsTrigger value="mine">Mine</TabsTrigger>
        </TabsList>
      </Tabs>
      {filter === "mine" && !canAct ? (
        <Empty
          title="Sign in to see your organizations"
          action={
            <Button asChild>
              <Link href="/auth">Sign in</Link>
            </Button>
          }
        />
      ) : (
        <PagedList
          list={list}
          pick={(p) => p.organizations}
          className="grid gap-4 sm:grid-cols-2"
          render={(o) => <OrgCard org={o} />}
          empty={
            <Empty
              title="No organizations yet"
              body="Organizations group members, teams, repositories and projects."
            />
          }
        />
      )}
      <OrgDialog open={create} onOpenChange={setCreate} />
    </div>
  );
}
