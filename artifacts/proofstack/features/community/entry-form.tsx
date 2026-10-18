"use client";
import { useEffect, useState } from "react";
import type { CommunityEntry } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCommunityRun } from "@/hooks/use-community";
import { csv, KIND_HINT, KIND_LABEL } from "@/lib/community";
import { AssistInline } from "./assist";
import { Fld, FormDialog, selectCls } from "./ui";

export type EntryScope = { projectId?: string; organizationId?: string };
type Kind =
  | "experience"
  | "repository"
  | "contribution"
  | "achievement"
  | "challenge"
  | "evidence"
  | "release"
  | "documentation";

export function EntryDialog({
  open,
  onOpenChange,
  entry,
  scope,
  kinds,
  defaultKind,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entry?: CommunityEntry;
  scope: EntryScope;
  kinds: readonly string[];
  defaultKind?: string;
}) {
  const { run, pending, error } = useCommunityRun();
  const [f, setF] = useState({
    kind: kinds[0] as string,
    title: "",
    subtitle: "",
    description: "",
    url: "",
    tech: "",
    startDate: "",
    endDate: "",
    version: "",
    ai: false,
  });
  useEffect(() => {
    if (!open) return;
    setF({
      kind:
        entry?.kind ??
        (defaultKind && kinds.includes(defaultKind) ? defaultKind : kinds[0]),
      title: entry?.title ?? "",
      subtitle: entry?.subtitle ?? "",
      description: entry?.description ?? "",
      url: entry?.url ?? "",
      tech: entry?.technologies.join(", ") ?? "",
      startDate: entry?.startDate ?? "",
      endDate: entry?.endDate ?? "",
      version: entry?.version ?? "",
      ai: entry?.aiAssisted ?? false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);
  const set = (k: keyof typeof f, v: string | boolean) =>
    setF((s) => ({ ...s, [k]: v }));
  const label = (KIND_LABEL[f.kind] ?? f.kind).toLowerCase();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={entry ? "Edit record" : "Add a record"}
      description={
        KIND_HINT[f.kind] ??
        "Records are labelled by source. A label is not a verification."
      }
      pending={pending}
      error={error}
      onSubmit={async () => {
        const r = await run(
          {
            action: "entry-save",
            id: entry?.id,
            kind: f.kind as Kind,
            title: f.title.trim(),
            subtitle: f.subtitle.trim(),
            description: f.description.trim(),
            url: f.url.trim(),
            technologies: csv(f.tech),
            startDate: f.startDate,
            endDate: f.endDate,
            version: f.kind === "release" ? f.version.trim() : "",
            aiAssisted: f.ai,
            ...(scope.projectId ? { projectId: scope.projectId } : {}),
            ...(scope.organizationId
              ? { organizationId: scope.organizationId }
              : {}),
          },
          "Record saved.",
        );
        if (r) onOpenChange(false);
      }}
    >
      {kinds.length > 1 && (
        <Fld label="Kind">
          <select
            className={selectCls}
            value={f.kind}
            onChange={(e) => set("kind", e.target.value)}
            disabled={!!entry}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k] ?? k}
              </option>
            ))}
          </select>
        </Fld>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Fld label="Title">
          <Input
            required
            maxLength={160}
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Fld>
        <Fld label="Subtitle" hint="Company, role, organizer, repo owner...">
          <Input
            maxLength={160}
            value={f.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
          />
        </Fld>
      </div>
      <Fld label="Description">
        <Textarea
          rows={4}
          maxLength={4000}
          value={f.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Fld>
      <Fld
        label="Link"
        hint={`Linking a public URL labels this ${label} as linked evidence.`}
      >
        <Input
          type="url"
          placeholder="https://"
          value={f.url}
          onChange={(e) => set("url", e.target.value)}
        />
      </Fld>
      <Fld label="Technologies">
        <Input
          value={f.tech}
          onChange={(e) => set("tech", e.target.value)}
          placeholder="Rust, Postgres"
        />
      </Fld>
      <div className="grid gap-4 sm:grid-cols-3">
        <Fld label="Start">
          <Input
            type="date"
            value={f.startDate}
            onChange={(e) => set("startDate", e.target.value)}
          />
        </Fld>
        <Fld label="End">
          <Input
            type="date"
            value={f.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </Fld>
        {f.kind === "release" && (
          <Fld label="Version">
            <Input
              maxLength={40}
              value={f.version}
              onChange={(e) => set("version", e.target.value)}
              placeholder="1.4.0"
            />
          </Fld>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={f.ai}
          onChange={(e) => set("ai", e.target.checked)}
        />
        This text was written with AI assistance
      </label>
      {f.kind === "documentation" && (
        <AssistInline
          tasks={["documentation-assistance"]}
          text={f.description || f.title}
          applyLabel="Replace description"
          onApply={(d) =>
            setF((s) => ({ ...s, description: d.content, ai: true }))
          }
        />
      )}
    </FormDialog>
  );
}
