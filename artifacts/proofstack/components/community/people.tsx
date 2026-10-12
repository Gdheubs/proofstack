"use client";
import Link from "next/link";
import type { CommunityPerson } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useCommunityRun, useCsrf } from "@/hooks/use-community";
import { PersonAvatar, PersonLink, Tags } from "./ui";

export function FollowButton({ person }: { person: CommunityPerson }) {
  const { run, pending } = useCommunityRun();
  const { canAct } = useCsrf();
  if (person.isMe) return null;
  if (!canAct)
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/auth">Sign in to follow</Link>
      </Button>
    );
  const on = person.followingByMe;
  return (
    <Button
      size="sm"
      variant={on ? "secondary" : "default"}
      disabled={pending}
      aria-pressed={on}
      onClick={() =>
        run(
          { action: "follow", targetId: person.id, enabled: !on },
          on ? `Unfollowed @${person.handle}.` : `Following @${person.handle}.`,
        )
      }
    >
      {on ? "Following" : "Follow"}
    </Button>
  );
}

export function PersonCard({ person }: { person: CommunityPerson }) {
  return (
    <div className="flex gap-3 rounded-lg border bg-card p-4">
      <PersonAvatar person={person} size={48} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <PersonLink person={person} />
          <FollowButton person={person} />
        </div>
        {person.bio && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {person.bio}
          </p>
        )}
        <Tags items={person.skills.slice(0, 5)} skill />
        <p className="font-mono text-xs text-muted-foreground">
          {person.followers} followers · {person.following} following
          {person.location ? ` · ${person.location}` : ""}
        </p>
      </div>
    </div>
  );
}
