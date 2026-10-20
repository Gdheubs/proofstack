"use client";
import { useState } from "react";
import type { RepositoryData } from "@workspace/api-client-react";
import { card, field, Field, values, val } from "@/features/careers/shared";
import { useRepositoryRun } from "@/hooks/use-repository";
import { ActionForm } from "./action-form";
import { CodeEditor } from "./code-editor";
export function Editor({
  data: d,
  mode,
  onClose,
}: {
  data: RepositoryData;
  mode: "new" | "edit" | "folder";
  onClose: () => void;
}) {
  const a = useRepositoryRun();
  const r = d.repositories[0];
  const edit = mode === "edit";
  const folder = mode === "folder";
  const [remove, setRemove] = useState(false);
  const [path, setPath] = useState(d.folder ? d.folder + "/" : "");
  const [content, setContent] = useState(edit ? (d.file?.content ?? "") : "");
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
            path:
              edit && d.file
                ? d.file.path
                : folder
                  ? `${val(f, "path").replace(/\/+$/, "")}/.gitkeep`
                  : val(f, "path"),
            content: remove ? "" : content,
            message: val(f, "message"),
            remove,
          })
        )
          onClose();
      }}
    >
      <h2 className="text-xl font-semibold">
        {edit ? "Edit file" : folder ? "Create folder" : "New file"} ·{" "}
        {d.branch}
      </h2>
      <ActionForm
        action={a}
        label={remove ? "Commit deletion" : "Commit change"}
      >
        {edit ? (
          <p className="font-mono text-sm">{d.file?.path}</p>
        ) : (
          <label className="block space-y-1 text-sm">
            <span>{folder ? "Folder path" : "File path"}</span>
            <input
              className={field}
              name="path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              maxLength={folder ? 230 : 240}
              required
            />
          </label>
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
        {folder ? (
          <p className="text-xs text-muted-foreground">
            Git tracks files rather than empty folders. A `.gitkeep` marker will
            be committed inside this folder.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <label className="block">Source file · up to 1 MiB</label>
            <CodeEditor
              path={edit && d.file ? d.file.path : path}
              value={content}
              onChange={setContent}
              readOnly={remove}
            />
          </div>
        )}
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
