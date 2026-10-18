"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommunityProject } from "@workspace/api-client-react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCommunityList, useCommunityRun } from "@/hooks/use-community";
import { assetUrl, csv, slugify } from "@/lib/community";
import { AssistInline } from "./assist";
import { Fld, FormDialog, selectCls } from "./ui";
import { ImagePicker } from "./uploader";

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project?: CommunityProject;
  organizationId?: string;
}) {
  const router = useRouter();
  const { run, pending, error } = useCommunityRun();
  const orgs = useCommunityList(
    { view: "organizations", filter: "mine" },
    open,
  );
  const orgList = orgs.pages.flatMap((p) => p.organizations);
  const [f, setF] = useState({
    slug: "",
    title: "",
    description: "",
    tech: "",
    demoUrl: "",
    repositoryUrl: "",
    visibility: "public",
    org: "",
  });
  const [shots, setShots] = useState<string[]>([]);
  const [slugTouched, setSlugTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({
      slug: project?.slug ?? "",
      title: project?.title ?? "",
      description: project?.description ?? "",
      tech: project?.technologies.join(", ") ?? "",
      demoUrl: project?.demoUrl ?? "",
      repositoryUrl: project?.repositoryUrl ?? "",
      visibility:
        project?.visibility ?? (organizationId ? "organization" : "public"),
      org: project?.organizationId ?? organizationId ?? "",
    });
    setShots(project?.screenshots ?? []);
    setSlugTouched(!!project);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={project ? "Edit project" : "New project"}
      description="You become the first contributor automatically."
      pending={pending}
      error={error}
      onSubmit={async () => {
        const r = await run(
          {
            action: "project-save",
            id: project?.id,
            slug: f.slug,
            title: f.title.trim(),
            description: f.description.trim(),
            technologies: csv(f.tech),
            screenshots: shots,
            demoUrl: f.demoUrl.trim(),
            repositoryUrl: f.repositoryUrl.trim(),
            visibility: f.visibility as "public" | "organization",
            organizationId:
              f.visibility === "organization" ? f.org || null : null,
          },
          project ? "Project saved." : "Project created.",
        );
        if (r) {
          onOpenChange(false);
          const slug = r.slug ?? f.slug;
          if (slug && (!project || slug !== project.slug))
            router.push(`/projects/${slug}`);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Fld label="Title">
          <Input
            required
            maxLength={120}
            value={f.title}
            onChange={(e) => {
              set("title", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
          />
        </Fld>
        <Fld label="Slug" hint="Used in the project URL.">
          <Input
            required
            maxLength={48}
            value={f.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", slugify(e.target.value));
            }}
          />
        </Fld>
      </div>
      <Fld label="Description">
        <Textarea
          rows={5}
          maxLength={5000}
          value={f.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Fld>
      <Fld label="Technologies" hint="Comma separated.">
        <Input value={f.tech} onChange={(e) => set("tech", e.target.value)} />
      </Fld>
      <div className="grid gap-4 sm:grid-cols-2">
        <Fld label="Demo URL">
          <Input
            type="url"
            placeholder="https://"
            value={f.demoUrl}
            onChange={(e) => set("demoUrl", e.target.value)}
          />
        </Fld>
        <Fld label="Repository URL" hint="A manual link; no GitHub sync.">
          <Input
            type="url"
            placeholder="https://"
            value={f.repositoryUrl}
            onChange={(e) => set("repositoryUrl", e.target.value)}
          />
        </Fld>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Fld label="Visibility">
          <select
            className={selectCls}
            value={f.visibility}
            onChange={(e) => set("visibility", e.target.value)}
          >
            <option value="public">Public</option>
            <option value="organization">Organization only</option>
          </select>
        </Fld>
        {f.visibility === "organization" && (
          <Fld label="Organization">
            <select
              required
              className={selectCls}
              value={f.org}
              onChange={(e) => set("org", e.target.value)}
            >
              <option value="">Choose...</option>
              {orgList.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Fld>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Screenshots</p>
        {shots.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {shots.map((s) => (
              <li key={s} className="relative">
                <img
                  src={assetUrl(s)}
                  alt="Screenshot"
                  className="aspect-video w-full rounded border object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove screenshot"
                  className="absolute right-1 top-1 rounded-full bg-background p-1 shadow"
                  onClick={() => setShots((x) => x.filter((y) => y !== s))}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <ImagePicker
          label="Upload screenshot"
          onDone={(p) => setShots((x) => [...x, p])}
        />
      </div>
      <AssistInline
        tasks={[
          "project-summary",
          "project-categorization",
          "suggested-tags",
          "skill-extraction",
        ]}
        text={f.description || f.title}
        applyLabel="Apply to project"
        onApply={(d, t) => {
          if (t === "project-summary") set("description", d.content);
          else if (t === "suggested-tags")
            set("tech", csv([f.tech, ...d.tags].join(",")).join(", "));
          else if (t === "skill-extraction")
            set("tech", csv([f.tech, ...d.skills].join(",")).join(", "));
          else if (d.category)
            set("tech", csv([f.tech, d.category].join(",")).join(", "));
        }}
      />
    </FormDialog>
  );
}
