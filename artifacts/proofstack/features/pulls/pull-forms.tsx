"use client";
import { useState } from "react";
import type { PullData } from "@workspace/api-client-react";
import {
  card,
  Field,
  Select,
  values,
  val,
  field,
} from "@/features/careers/shared";
import { ActionForm } from "@/features/repositories/action-form";
import { usePullRun } from "@/hooks/use-pulls";
export function ReviewForm({ data: d }: { data: PullData }) {
  const a = usePullRun();
  const p = d.pull!;
  return (
    <form
      className={card}
      onSubmit={async (e) => {
        const f = values(e);
        await a.run({
          action: "review",
          id: p.id,
          sourceHead: p.sourceHead,
          targetHead: p.targetHead,
          decision: val(f, "decision"),
          body: val(f, "body"),
        });
      }}
    >
      <h2 className="font-semibold">Submit a review</h2>
      <ActionForm action={a} label="Record review">
        <Select
          label="Decision"
          name="decision"
          items={["approved", "changes-requested"]}
        />
        <Field label="Review notes" name="body" area max={4000} />
        <label className="flex gap-2 text-xs">
          <input type="checkbox" required />I reviewed{" "}
          {p.sourceHead.slice(0, 10)} against {p.targetHead.slice(0, 10)}.
        </label>
      </ActionForm>
    </form>
  );
}
export function CommentForm({ id }: { id: string }) {
  const a = usePullRun();
  const [body, setBody] = useState("");
  return (
    <form
      className={card}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await a.run({ action: "comment", id, body })) setBody("");
      }}
    >
      <ActionForm action={a} label="Add comment">
        <label className="block text-sm">
          Discussion
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={field + " mt-1"}
            rows={4}
            required
            maxLength={4000}
          />
        </label>
      </ActionForm>
    </form>
  );
}
export function MergeForm({ data: d }: { data: PullData }) {
  const a = usePullRun();
  const p = d.pull!;
  return (
    <form
      className={card}
      onSubmit={async (e) => {
        e.preventDefault();
        await a.run({
          action: "merge",
          id: p.id,
          sourceHead: p.sourceHead,
          targetHead: p.targetHead,
        });
      }}
    >
      <h2 className="font-semibold">Merge into {p.targetBranch}</h2>
      <ActionForm action={a} label="Check conflicts and merge">
        <p className="text-sm">
          Creates a merge commit after checking the latest heads, reviews,
          permissions, and quota. Recent MFA is required.
        </p>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" required />I am ready to merge these reviewed
          commits.
        </label>
      </ActionForm>
    </form>
  );
}
export function StateForm({ data: d }: { data: PullData }) {
  const a = usePullRun();
  const p = d.pull!;
  return (
    <form
      className={card}
      onSubmit={async (e) => {
        const f = values(e);
        await a.run({ action: "state", id: p.id, status: val(f, "status") });
      }}
    >
      <ActionForm action={a} label="Update status">
        <Select
          label="Pull request status"
          name="status"
          items={
            p.status === "open"
              ? ["closed"]
              : p.status === "draft"
                ? ["open", "closed"]
                : ["open"]
          }
        />
      </ActionForm>
    </form>
  );
}
export function CheckForm({ data: d }: { data: PullData }) {
  const a = usePullRun();
  const p = d.pull!;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await a.run({
          action: "check",
          id: p.id,
          sourceHead: p.sourceHead,
          targetHead: p.targetHead,
        });
      }}
    >
      <ActionForm action={a} label="Run patch check">
        <p className="mb-3 text-xs text-muted-foreground">
          Runs Git whitespace validation on these commits. It does not execute
          application tests or CI jobs.
        </p>
      </ActionForm>
    </form>
  );
}
