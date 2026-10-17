"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getGetCommunityQueryKey,
  useGetCommunity,
} from "@workspace/api-client-react";
import { ExternalLink, Plus, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/auth/shared";
import { useCommunityRun } from "@/hooks/use-community";
import { ENTRY_KINDS, errStatus, roleLabel } from "@/lib/community";
import { Empty, FormDialog, QueryError } from "./ui";
import { EntryList } from "./entry-list";
import { OrgDialog } from "./org-dialog";
import { OrgMembers } from "./org-members";
import { OrgTeams } from "./org-teams";
import { ProjectCard } from "./project-card";
import { ProjectDialog } from "./project-dialog";

export function OrgView({ slug }: { slug: string }) {
  const router = useRouter();
  const params = { view: "organization", handle: slug } as const;
  const q = useGetCommunity(params, {
    query: { queryKey: getGetCommunityQueryKey(params) },
  });
  const { run, pending } = useCommunityRun();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [typed, setTyped] = useState("");
  const [newProject, setNewProject] = useState(false);
  const o = q.data?.organization;
  if (q.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-60" />
      </div>
    );
  if (q.isError)
    return errStatus(q.error) === 404 ? (
      <Empty
        title="Organization not found"
        body="It may be private or removed."
        action={
          <Button asChild variant="outline">
            <Link href="/organizations">All organizations</Link>
          </Button>
        }
      />
    ) : (
      <QueryError error={q.error} onRetry={() => q.refetch()} />
    );
  if (!o) return <Empty title="Organization not found" />;
  const member = !!o.myRole;
  return (
    <div className="space-y-8">
      <header className="space-y-3 rise">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Organization · {o.visibility} · {o.memberCount} members
              {member ? ` · you: ${roleLabel(o.myRole)}` : ""}
            </p>
            <h1 className="text-3xl font-semibold sm:text-4xl">{o.name}</h1>
          </div>
          {o.canManage && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
                <Settings className="h-4 w-4" /> Settings
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTyped("");
                  setDel(true);
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
          )}
        </div>
        {o.description && (
          <p className="max-w-3xl whitespace-pre-wrap">{o.description}</p>
        )}
        {o.website && (
          <a
            className="inline-flex items-center gap-1 text-sm underline underline-offset-2"
            href={o.website}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            <ExternalLink className="h-4 w-4" />
            {o.website.replace(/^https?:\/\//, "")}
          </a>
        )}
      </header>
      <Tabs defaultValue="projects">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="projects">Projects</TabsTrigger>
          {member && <TabsTrigger value="members">Members</TabsTrigger>}
          {member && <TabsTrigger value="teams">Teams</TabsTrigger>}
          {member && <TabsTrigger value="repos">Repository links</TabsTrigger>}
        </TabsList>
        <TabsContent value="projects" className="mt-5 space-y-4">
          {member && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setNewProject(true)}>
                <Plus className="h-4 w-4" /> New project
              </Button>
            </div>
          )}
          {o.projects.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {o.projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <Empty
              title="No projects visible"
              body="Public projects appear here. Organization-only projects are shown to active members."
            />
          )}
        </TabsContent>
        {member && (
          <TabsContent value="members" className="mt-5">
            <OrgMembers org={o} />
          </TabsContent>
        )}
        {member && (
          <TabsContent value="teams" className="mt-5">
            <OrgTeams org={o} />
          </TabsContent>
        )}
        {member && (
          <TabsContent value="repos" className="mt-5">
            <p className="mb-4 text-sm text-muted-foreground">
              Manual repository links are organization records, not hosted Git
              repositories on ProofStack.
            </p>
            <EntryList
              entries={o.repositories}
              kinds={ENTRY_KINDS.organization}
              scope={{ organizationId: o.id }}
              canAdd={o.canManage}
              grouped={false}
            />
          </TabsContent>
        )}
      </Tabs>
      <OrgDialog open={edit} onOpenChange={setEdit} org={o} />
      <ProjectDialog
        open={newProject}
        onOpenChange={setNewProject}
        organizationId={o.id}
      />
      <FormDialog
        open={del}
        onOpenChange={setDel}
        title={`Delete ${o.name}?`}
        description="This permanently deletes the organization, its teams, memberships and ALL of its projects. Type the name to confirm."
        submitLabel="Delete everything"
        pending={pending || typed !== o.name}
        onSubmit={async () => {
          if (typed !== o.name) return;
          if (
            await run(
              { action: "organization-delete", id: o.id },
              "Organization deleted.",
            )
          ) {
            setDel(false);
            router.push("/organizations");
          }
        }}
      >
        <label className="block space-y-1.5 text-sm">
          <span>
            Type <b>{o.name}</b> to enable deletion
          </span>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </label>
      </FormDialog>
    </div>
  );
}
