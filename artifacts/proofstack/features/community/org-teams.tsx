"use client";
import { useEffect, useState } from "react";
import type {
  CommunityOrganization,
  CommunityTeam,
} from "@workspace/api-client-react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/features/auth/shared";
import { useCommunityRun } from "@/hooks/use-community";
import { Empty, Fld, FormDialog, PersonAvatar, selectCls } from "./ui";

function TeamDialog({
  org,
  team,
  open,
  onOpenChange,
}: {
  org: CommunityOrganization;
  team?: CommunityTeam;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { run, pending, error } = useCommunityRun();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (open) {
      setName(team?.name ?? "");
      setDescription(team?.description ?? "");
    }
  }, [open, team]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={team ? "Edit team" : "New team"}
      pending={pending}
      error={error}
      onSubmit={async () => {
        if (
          await run(
            {
              action: "team-save",
              id: team?.id,
              organizationId: org.id,
              name: name.trim(),
              description: description.trim(),
            },
            "Team saved.",
          )
        )
          onOpenChange(false);
      }}
    >
      <Fld label="Name">
        <Input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Fld>
      <Fld label="Description">
        <Textarea
          rows={3}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Fld>
    </FormDialog>
  );
}

function TeamCard({
  org,
  team,
}: {
  org: CommunityOrganization;
  team: CommunityTeam;
}) {
  const { run, pending } = useCommunityRun();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [pick, setPick] = useState("");
  const available = org.members.filter(
    (m) => !team.members.some((t) => t.id === m.person.id),
  );
  return (
    <li className="space-y-3 rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold">{team.name}</h4>
          {team.description && (
            <p className="text-sm text-muted-foreground">{team.description}</p>
          )}
        </div>
        {org.canManage && (
          <div className="flex">
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Edit ${team.name}`}
              onClick={() => setEdit(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Delete ${team.name}`}
              onClick={() => setDel(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      {team.members.length ? (
        <ul className="flex flex-wrap gap-2">
          {team.members.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs"
            >
              <PersonAvatar person={m} size={22} />@{m.handle}
              {org.canManage && (
                <button
                  aria-label={`Remove ${m.handle} from ${team.name}`}
                  disabled={pending}
                  onClick={() =>
                    run(
                      {
                        action: "team-member",
                        id: team.id,
                        targetId: m.id,
                        enabled: false,
                      },
                      "Removed from team.",
                    )
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No members on this team yet.
        </p>
      )}
      {org.canManage && available.length > 0 && (
        <div className="flex gap-2">
          <select
            aria-label={`Add member to ${team.name}`}
            className={selectCls}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Add an organization member...</option>
            {available.map((m) => (
              <option key={m.person.id} value={m.person.id}>
                @{m.person.handle}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!pick || pending}
            onClick={async () => {
              if (
                await run(
                  {
                    action: "team-member",
                    id: team.id,
                    targetId: pick,
                    enabled: true,
                  },
                  "Added to team.",
                )
              )
                setPick("");
            }}
          >
            Add
          </Button>
        </div>
      )}
      <TeamDialog org={org} team={team} open={edit} onOpenChange={setEdit} />
      <Confirm
        open={del}
        title={`Delete team ${team.name}?`}
        description="Team membership is removed. Organization members stay."
        confirmLabel="Delete team"
        onCancel={() => setDel(false)}
        onConfirm={() => {
          setDel(false);
          void run({ action: "team-delete", id: team.id }, "Team deleted.");
        }}
      />
    </li>
  );
}

export function OrgTeams({ org }: { org: CommunityOrganization }) {
  const [add, setAdd] = useState(false);
  return (
    <div className="space-y-4">
      {org.canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAdd(true)}>
            <Plus className="h-4 w-4" /> New team
          </Button>
        </div>
      )}
      {org.teams.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {org.teams.map((t) => (
            <TeamCard key={t.id} org={org} team={t} />
          ))}
        </ul>
      ) : (
        <Empty
          title="No teams"
          body="Teams are visible to active members only."
        />
      )}
      <TeamDialog org={org} open={add} onOpenChange={setAdd} />
    </div>
  );
}
