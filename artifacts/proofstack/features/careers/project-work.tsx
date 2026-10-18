"use client";
import { useState } from "react";
import Link from "next/link";
import { useGetCareers, type CareerIssue } from "@workspace/api-client-react";
import { PageHead, QueryError, Empty } from "@/features/community/ui";
import {
  card,
  Field,
  Select,
  CareerForm,
  useCareerRun,
  values,
  val,
  Pager,
} from "./shared";
export function ProjectWork({ id }: { id: string }) {
  const [offset, setOffset] = useState(0);
  const r = useGetCareers({ view: "project-work", projectId: id, offset });
  const [edit, setEdit] = useState<CareerIssue | null | undefined>();
  const a = useCareerRun();
  if (r.isPending) return <p>Loading work board…</p>;
  if (r.error) return <QueryError error={r.error} />;
  const d = r.data;
  if (!d) return null;
  return (
    <>
      <PageHead
        eyebrow="Project collaboration"
        title={d.projectTitle + " · Work board"}
      >
        {d.canContribute && (
          <button className="underline" onClick={() => setEdit(null)}>
            Create task
          </button>
        )}
        <Link className="underline" href="/projects">
          Projects
        </Link>
      </PageHead>
      <p className="mb-6 text-muted-foreground">
        Plan work, assign contributors, and attach a pull request, demo, or
        other evidence when a task is done. Tasks inherit project visibility.
      </p>
      {edit !== undefined && (
        <form
          key={edit?.id ?? "new"}
          className={card + " mb-6"}
          onSubmit={async (e) => {
            const f = values(e);
            if (
              await a.run({
                action: "issue-save",
                ...(edit ? { id: edit.id } : {}),
                projectId: id,
                title: val(f, "title"),
                description: val(f, "description"),
                status: val(f, "status"),
                assigneeId: val(f, "assignee") || null,
                evidenceUrl: val(f, "evidence"),
              })
            )
              setEdit(undefined);
          }}
        >
          <h2 className="text-xl font-semibold">
            {edit ? "Edit task" : "New task"}
          </h2>
          <CareerForm action={a} submit="Save task">
            <Field
              name="title"
              label="Task title"
              value={edit?.title}
              required
            />
            <Field
              name="description"
              label="Scope and acceptance criteria"
              value={edit?.description}
              area
              max={6000}
            />
            <Select
              label="Status"
              name="status"
              items={["open", "in-progress", "done"]}
              value={edit?.status}
            />
            <label className="block text-sm">
              Assignee
              <select
                name="assignee"
                className="ml-2 rounded border bg-background p-2"
                defaultValue={edit?.assigneeId ?? ""}
                disabled={!d.canManageProject && !!edit}
              >
                <option value="">Unassigned</option>
                {d.assignees
                  .filter(
                    (p) =>
                      d.canManageProject ||
                      p.id === a.viewerId ||
                      p.id === edit?.assigneeId,
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
              </select>
            </label>
            {!d.canManageProject && edit && (
              <input
                type="hidden"
                name="assignee"
                value={edit.assigneeId ?? ""}
              />
            )}
            <Field
              name="evidence"
              label="Evidence URL (HTTPS)"
              value={edit?.evidenceUrl}
              max={2048}
            />
          </CareerForm>
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => setEdit(undefined)}
          >
            Cancel
          </button>
        </form>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {["open", "in-progress", "done"].map((status) => (
          <section key={status} className="space-y-3">
            <h2 className="rounded-lg bg-muted p-3 font-semibold capitalize">
              {status.replace("-", " ")}
            </h2>
            {d.issues
              .filter((i) => i.status === status)
              .map((i) => (
                <article className={card} key={i.id}>
                  <h3 className="font-semibold">{i.title}</h3>
                  <p className="whitespace-pre-wrap text-sm">{i.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.assigneeName ?? "Unassigned"} · opened by {i.authorName}
                  </p>
                  {i.evidenceUrl && (
                    <a
                      className="text-sm underline"
                      href={i.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View evidence ↗
                    </a>
                  )}
                  {i.canEdit && (
                    <button
                      className="ml-3 text-sm underline"
                      onClick={() => setEdit(i)}
                    >
                      Edit
                    </button>
                  )}
                </article>
              ))}
          </section>
        ))}
      </div>
      {!d.issues.length && (
        <Empty
          title="Make the next contribution clear"
          body="Project owners and accepted contributors can create the first task."
        />
      )}
      <Pager offset={offset} more={d.hasMore} change={setOffset} />
    </>
  );
}
