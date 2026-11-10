"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getGetRepositoriesQueryKey,
  useGetRepositories,
  type CommunityProject,
} from "@workspace/api-client-react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCommunityList, useCommunityRun } from "@/hooks/use-community";
import { useRepositoryRun } from "@/hooks/use-repository";
import { useViewer } from "@/hooks/use-viewer";
import { useDebounced } from "@/hooks/use-debounced";
import { SITE_SEGMENTS } from "@/lib/navigation";
import { assetUrl, csv, slugify } from "@/lib/community";
import { AssistInline } from "./assist";
import { Fld, FormDialog, selectCls } from "./ui";
import { ImagePicker } from "./uploader";

// Must match repoNameSchema in the API.
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

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
  // New projects get a ProofStack repository at /<handle>/<name> when
  // hosting is on; its address becomes the Repository URL.
  const repo = useRepositoryRun();
  const { viewer } = useViewer();
  const hosting = useGetRepositories(
    {},
    {
      query: {
        queryKey: getGetRepositoriesQueryKey({}),
        enabled: open && !project,
      },
    },
  );
  const canHost = !project && !!hosting.data?.enabled && !!viewer?.handle;
  const [makeRepo, setMakeRepo] = useState(true);
  const [repoName, setRepoName] = useState("");
  const [repoNameTouched, setRepoNameTouched] = useState(false);
  // Is this name already one of the member's repositories? (Names are unique
  // per member; other members may use the same name.)
  const checkName = useDebounced(repoName, 400);
  const nameCheck = useGetRepositories(
    { owner: viewer?.handle ?? "", name: checkName },
    {
      query: {
        queryKey: getGetRepositoriesQueryKey({
          owner: viewer?.handle ?? "",
          name: checkName,
        }),
        enabled:
          open &&
          canHost &&
          makeRepo &&
          REPO_NAME.test(checkName) &&
          !!viewer?.handle,
        retry: false,
        staleTime: 0,
      },
    },
  );
  const nameTaken =
    checkName === repoName && !!nameCheck.data?.repositories.length;
  // A username that is also a site page name cannot carry repository addresses.
  const reservedHandle =
    !!viewer?.handle && SITE_SEGMENTS.has(viewer.handle.toLowerCase());
  const repoNameProblem = reservedHandle
    ? `Your username "${viewer?.handle}" is also a ProofStack page name. Choose a new username in Settings, Profile to create repositories.`
    : !REPO_NAME.test(repoName)
      ? "Use up to 100 letters, numbers, dots, hyphens or underscores, starting with a letter or number."
      : /[.]git$/i.test(repoName)
        ? "A repository name cannot end in .git."
        : nameTaken
          ? `Name already taken: you already have a repository called "${repoName}". Choose another name.`
          : null;
  const creatingRepo = canHost && makeRepo;
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
    setMakeRepo(true);
    setRepoName(project?.slug ?? "");
    setRepoNameTouched(false);
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
      pending={pending || repo.pending}
      error={error || repo.error}
      onSubmit={async () => {
        if (creatingRepo && repoNameProblem) return;
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
            // Filled by the server from the new repository's address.
            repositoryUrl: creatingRepo ? "" : f.repositoryUrl.trim(),
            visibility: f.visibility as "public" | "organization" | "private",
            organizationId:
              f.visibility === "organization" ? f.org || null : null,
          },
          project ? "Project saved." : "Project created.",
        );
        if (r && creatingRepo && r.id) {
          const made = await repo.run({
            action: "create",
            projectId: r.id,
            name: repoName,
          });
          // The project exists either way; a refused name is shown here.
          if (!made) return;
        }
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
              if (!slugTouched) {
                set("slug", slugify(e.target.value));
                if (!repoNameTouched) setRepoName(slugify(e.target.value));
              }
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
              if (!repoNameTouched) setRepoName(slugify(e.target.value));
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
        {creatingRepo ? (
          <Fld
            label="Repository name"
            hint={`Address: ${typeof window === "undefined" ? "" : window.location.origin}/${viewer?.handle}/${repoName || "…"}`}
          >
            <Input
              required
              maxLength={100}
              value={repoName}
              aria-invalid={!!repoNameProblem}
              onChange={(e) => {
                setRepoNameTouched(true);
                setRepoName(e.target.value.trim());
              }}
            />
            {repoNameProblem && (
              <span role="alert" className="block text-xs text-destructive">
                {repoNameProblem}
              </span>
            )}
          </Fld>
        ) : (
          <Fld
            label="Repository URL"
            hint="A link to the code, for example on GitHub."
          >
            <Input
              type="url"
              placeholder="https://"
              value={f.repositoryUrl}
              onChange={(e) => set("repositoryUrl", e.target.value)}
            />
          </Fld>
        )}
      </div>
      {canHost && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={makeRepo}
            onChange={(e) => setMakeRepo(e.target.checked)}
          />
          <span>
            Create a ProofStack repository for this project
            <span className="block text-xs text-muted-foreground">
              Edit and run its code in Code; the Repository URL fills itself.
              Untick to link code hosted elsewhere.
            </span>
          </span>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Fld label="Visibility">
          <select
            className={selectCls}
            value={f.visibility}
            onChange={(e) => set("visibility", e.target.value)}
          >
            <option value="public">Public</option>
            <option value="private">Private (only you and contributors)</option>
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
