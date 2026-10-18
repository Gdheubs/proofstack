"use client";
import { useState } from "react";
import type { CommunityProject } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Confirm, Notice } from "@/features/auth/shared";
import { useCommunityRun } from "@/hooks/use-community";
import { PersonAvatar, PersonLink } from "./ui";

export function Contributors({ project }: { project: CommunityProject }) {
  const { run, pending, error } = useCommunityRun();
  const [handle, setHandle] = useState("");
  const [rm, setRm] = useState<string | null>(null);
  const mineInvite = project.contributors.find(
    (c) => c.person.isMe && c.status === "pending",
  );
  return (
    <div className="space-y-4">
      {mineInvite && (
        <div className="rounded-md border border-accent bg-accent/10 p-4">
          <p className="font-medium">
            You are invited to contribute to this project.
          </p>
          <p className="mb-3 text-sm text-muted-foreground">
            Accepting adds you as a contributor. Until then the invitation
            grants no edit access and is not proof of contribution.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  {
                    action: "contributor-respond",
                    projectId: project.id,
                    accept: true,
                  },
                  "Invitation accepted.",
                )
              }
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  {
                    action: "contributor-respond",
                    projectId: project.id,
                    accept: false,
                  },
                  "Invitation declined.",
                )
              }
            >
              Decline
            </Button>
          </div>
        </div>
      )}
      <ul className="divide-y rounded-md border bg-card">
        {project.contributors.map((c) => (
          <li key={c.person.id} className="flex items-center gap-3 p-3">
            <PersonAvatar person={c.person} size={36} />
            <PersonLink person={c.person} />
            <span
              className={`ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${c.status === "active" ? "border-chart-3/60 bg-chart-3/10" : "border-dashed"}`}
            >
              {c.status === "active" ? "Contributor" : "Invited · pending"}
            </span>
            {project.canEdit && !c.person.isMe && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRm(c.person.id)}
              >
                {c.status === "pending" ? "Cancel invite" : "Remove"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {project.canEdit && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              {
                action: "contributor-invite",
                projectId: project.id,
                handle: handle.trim().replace(/^@/, ""),
              },
              "Invitation sent.",
            );
            if (r) setHandle("");
          }}
        >
          <label className="min-w-48 flex-1 space-y-1.5">
            <span className="text-sm font-medium">Invite by handle</span>
            <Input
              required
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@handle"
            />
          </label>
          <Button type="submit" disabled={pending}>
            Send invitation
          </Button>
        </form>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <Confirm
        open={!!rm}
        title="Remove this contributor?"
        description="They lose contributor status on this project."
        confirmLabel="Remove"
        onCancel={() => setRm(null)}
        onConfirm={() => {
          const id = rm!;
          setRm(null);
          void run(
            {
              action: "contributor-remove",
              projectId: project.id,
              targetId: id,
            },
            "Contributor removed.",
          );
        }}
      />
    </div>
  );
}
