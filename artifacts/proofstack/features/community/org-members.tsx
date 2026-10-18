"use client";
import { useState } from "react";
import type { CommunityOrganization } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Confirm, Notice } from "@/features/auth/shared";
import { useCommunityRun } from "@/hooks/use-community";
import { roleLabel } from "@/lib/community";
import { Empty, PersonAvatar, PersonLink, selectCls } from "./ui";

type Role = "organization_owner" | "organization_admin" | "organization_member";

export function OrgMembers({ org }: { org: CommunityOrganization }) {
  const { run, pending, error } = useCommunityRun();
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState<Role>("organization_member");
  const [rm, setRm] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {org.members.length ? (
        <ul className="divide-y rounded-md border bg-card">
          {org.members.map((m) => (
            <li
              key={m.person.id}
              className="flex flex-wrap items-center gap-3 p-3"
            >
              <PersonAvatar person={m.person} size={36} />
              <PersonLink person={m.person} />
              <div className="ml-auto flex items-center gap-2">
                {org.canManageRoles ? (
                  <select
                    aria-label={`Role for ${m.person.displayName}`}
                    className={`${selectCls} w-auto`}
                    value={m.role}
                    disabled={pending}
                    onChange={(e) =>
                      run(
                        {
                          action: "member-save",
                          organizationId: org.id,
                          handle: m.person.handle,
                          role: e.target.value as Role,
                        },
                        "Role updated.",
                      )
                    }
                  >
                    <option value="organization_member">member</option>
                    <option value="organization_admin">admin</option>
                    <option value="organization_owner">owner</option>
                  </select>
                ) : (
                  <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">
                    {roleLabel(m.role)}
                  </span>
                )}
                {org.canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRm(m.person.id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title="Members are private"
          body="Only active members can see the member list."
        />
      )}
      {org.canManage && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              {
                action: "member-save",
                organizationId: org.id,
                handle: handle.trim().replace(/^@/, ""),
                role,
              },
              "Member saved.",
            );
            if (r) setHandle("");
          }}
        >
          <label className="min-w-44 flex-1 space-y-1.5">
            <span className="text-sm font-medium">Add member by handle</span>
            <Input
              required
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@handle"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Role</span>
            <select
              className={selectCls}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="organization_member">member</option>
              {org.canManageRoles && (
                <>
                  <option value="organization_admin">admin</option>
                  <option value="organization_owner">owner</option>
                </>
              )}
            </select>
          </label>
          <Button type="submit" disabled={pending}>
            Add
          </Button>
        </form>
      )}
      {org.canManageRoles && (
        <p className="text-xs text-muted-foreground">
          Owners and admins must have a verified native sign-in factor. The
          server enforces this and protects the last owner.
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <Confirm
        open={!!rm}
        title="Remove this member?"
        description="They lose access to private organization content."
        confirmLabel="Remove member"
        onCancel={() => setRm(null)}
        onConfirm={() => {
          const id = rm!;
          setRm(null);
          void run(
            { action: "member-remove", organizationId: org.id, targetId: id },
            "Member removed.",
          );
        }}
      />
    </div>
  );
}
