"use client";
import { useState } from "react";
import type { RepositoryData } from "@workspace/api-client-react";
import { card, field, Field, values, val } from "@/features/careers/shared";
import { useRepositoryRun } from "@/hooks/use-repository";
import { ActionForm } from "./action-form";
export function Editor({
  data: d,
  edit,
  onClose,
}: {
  data: RepositoryData;
  edit: boolean;
  onClose: () => void;
}) {
  const a = useRepositoryRun();
  const r = d.repositories[0];
  const [remove, setRemove] = useState(false);
  return (
    <form
      className={card + " mb-5"}
      onSubmit={async (e) => {
        const f = values(e);
        if (
          await a.run({
            action: "commit",
            id: r.id,
            branch: d.branch,
            expectedHead: d.head,
            path: edit && d.file ? d.file.path : val(f, "path"),
            content: remove ? "" : val(f, "content"),
            message: val(f, "message"),
            remove,
          })
        )
          onClose();
      }}
    >
      <h2 className="text-xl font-semibold">
        {edit ? "Edit file" : "New file"} · {d.branch}
      </h2>
      <ActionForm
        action={a}
        label={remove ? "Commit deletion" : "Commit change"}
      >
        {edit ? (
          <p className="font-mono text-sm">{d.file?.path}</p>
        ) : (
          <Field
            label="File path"
            name="path"
            value={d.folder ? d.folder + "/" : ""}
            max={240}
            required
          />
        )}
        {edit && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={remove}
              onChange={(e) => setRemove(e.target.checked)}
            />
            Delete this file in a new commit
          </label>
        )}
        <label className="block text-sm">
          UTF-8 source (up to 32 KiB)
          <textarea
            name="content"
            className={field + " mt-1 min-h-80 font-mono text-xs"}
            defaultValue={edit ? d.file?.content : ""}
            spellCheck={false}
            disabled={remove}
          />
        </label>
        <Field name="message" label="Commit message" max={200} required />
        <p className="text-xs text-muted-foreground">
          Committing publishes this content to everyone who can read the
          project. Check for secrets before saving. Concurrent changes are
          rejected for your review.
        </p>
      </ActionForm>
      <button type="button" className="ml-3 underline" onClick={onClose}>
        Cancel
      </button>
    </form>
  );
}
export function BranchForm({
  data: d,
  onDone,
}: {
  data: RepositoryData;
  onDone: (branch: string) => void;
}) {
  const a = useRepositoryRun();
  return (
    <form
      className={card}
      onSubmit={async (e) => {
        const f = values(e);
        const name = val(f, "branch");
        const current = d.branches.find((b) => b.name === d.branch);
        if (
          current &&
          (await a.run({
            action: "branch",
            id: d.repositories[0].id,
            from: d.branch,
            branch: name,
            expectedHead: current.head,
          }))
        )
          onDone(name);
      }}
    >
      <h3 className="font-semibold">Start a working branch</h3>
      <ActionForm action={a} label="Create branch">
        <Field
          name="branch"
          label={`Branch from the latest ${d.branch}`}
          value="feature/"
          max={80}
          required
        />
      </ActionForm>
    </form>
  );
}
