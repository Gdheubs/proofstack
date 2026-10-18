"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommunityList, useCsrf } from "@/hooks/use-community";
import { Empty, PageHead, PagedList } from "./ui";
import { ProjectCard } from "./project-card";
import { ProjectDialog } from "./project-dialog";

export function ProjectsView() {
  const [filter, setFilter] = useState<"discover" | "mine">("discover");
  const [create, setCreate] = useState(false);
  const { canAct } = useCsrf();
  const list = useCommunityList(
    { view: "projects", filter },
    filter === "discover" || canAct,
  );
  return (
    <div>
      <PageHead eyebrow="Projects" title="Work in the open">
        {canAct ? (
          <Button onClick={() => setCreate(true)}>
            <Plus className="h-4 w-4" /> New project
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
          title="Sign in to see your projects"
          action={
            <Button asChild>
              <Link href="/auth">Sign in</Link>
            </Button>
          }
        />
      ) : (
        <PagedList
          list={list}
          pick={(p) => p.projects}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          render={(p) => <ProjectCard project={p} />}
          empty={
            <Empty
              title={
                filter === "mine"
                  ? "You have no projects yet"
                  : "No projects yet"
              }
              body="Projects hold releases, documentation, screenshots and evidence in one place."
              action={
                canAct ? (
                  <Button onClick={() => setCreate(true)}>
                    Create the first one
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}
      <ProjectDialog open={create} onOpenChange={setCreate} />
    </div>
  );
}
