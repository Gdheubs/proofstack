"use client";
import { useState } from "react";
import type { CommunityEntry } from "@workspace/api-client-react";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/features/auth/shared";
import { useCommunityRun } from "@/hooks/use-community";
import { KIND_HINT, KIND_LABEL } from "@/lib/community";
import { EntryDialog, type EntryScope } from "./entry-form";
import { Empty, SourceBadge, Tags } from "./ui";

function EntryRow({
  e,
  scope,
  kinds,
}: {
  e: CommunityEntry;
  scope: EntryScope;
  kinds: readonly string[];
}) {
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const { run } = useCommunityRun();
  const dates = [e.startDate, e.endDate].filter(Boolean).join(" to ");
  return (
    <li className="space-y-2 rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold">
            {e.title}
            {e.version && (
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                v{e.version}
              </span>
            )}
          </h4>
          {(e.subtitle || dates) && (
            <p className="text-sm text-muted-foreground">
              {[e.subtitle, dates].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SourceBadge label={e.sourceLabel} />
          {e.canEdit && (
            <>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Edit ${e.title}`}
                onClick={() => setEdit(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${e.title}`}
                onClick={() => setDel(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      {e.description && (
        <p className="whitespace-pre-wrap text-sm">{e.description}</p>
      )}
      <Tags items={e.technologies} />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {e.url && (
          <a
            href={e.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            <ExternalLink className="h-3 w-3" />{" "}
            {e.url.replace(/^https?:\/\//, "").slice(0, 48)}
          </a>
        )}
        {e.aiAssisted && (
          <span className="font-mono text-muted-foreground">
            AI-assisted text
          </span>
        )}
      </div>
      <EntryDialog
        open={edit}
        onOpenChange={setEdit}
        entry={e}
        scope={scope}
        kinds={kinds}
      />
      <Confirm
        open={del}
        title={`Delete "${e.title}"?`}
        description="This record will be removed permanently."
        confirmLabel="Delete record"
        onCancel={() => setDel(false)}
        onConfirm={() => {
          setDel(false);
          void run({ action: "entry-delete", id: e.id }, "Record deleted.");
        }}
      />
    </li>
  );
}

export function EntryList({
  entries,
  kinds,
  scope = {},
  canAdd,
  grouped = true,
}: {
  entries: CommunityEntry[];
  kinds: readonly string[];
  scope?: EntryScope;
  canAdd?: boolean;
  grouped?: boolean;
}) {
  const [add, setAdd] = useState<string | null>(null);
  const shown = entries.filter((e) => kinds.includes(e.kind));
  return (
    <div className="space-y-6">
      {canAdd && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAdd(kinds[0])}>
            <Plus className="h-4 w-4" /> Add record
          </Button>
        </div>
      )}
      {!shown.length ? (
        <Empty
          title="No records yet"
          body="Records you add appear here with a label showing where they come from."
        />
      ) : grouped ? (
        kinds.map((k) => {
          const rows = shown.filter((e) => e.kind === k);
          if (!rows.length) return null;
          return (
            <section key={k} aria-label={KIND_LABEL[k]}>
              <h3 className="font-serif text-lg">{KIND_LABEL[k]}</h3>
              {KIND_HINT[k] && (
                <p className="mb-2 text-xs text-muted-foreground">
                  {KIND_HINT[k]}
                </p>
              )}
              <ul className="mt-2 space-y-3">
                {rows.map((e) => (
                  <EntryRow key={e.id} e={e} scope={scope} kinds={kinds} />
                ))}
              </ul>
            </section>
          );
        })
      ) : (
        <ul className="space-y-3">
          {shown.map((e) => (
            <EntryRow key={e.id} e={e} scope={scope} kinds={kinds} />
          ))}
        </ul>
      )}
      <EntryDialog
        open={add !== null}
        onOpenChange={(o) => !o && setAdd(null)}
        scope={scope}
        kinds={kinds}
        defaultKind={add ?? undefined}
      />
    </div>
  );
}
