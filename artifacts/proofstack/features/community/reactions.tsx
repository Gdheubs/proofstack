"use client";
import type { CommunityReaction } from "@workspace/api-client-react";
import { Lightbulb, PartyPopper, ThumbsUp } from "lucide-react";
import { useCommunityRun, useCsrf } from "@/hooks/use-community";

const KINDS = [
  { kind: "like", label: "Like", Icon: ThumbsUp },
  { kind: "insightful", label: "Insightful", Icon: Lightbulb },
  { kind: "celebrate", label: "Celebrate", Icon: PartyPopper },
] as const;

export function ReactionBar({
  reactions,
  targetId,
  targetType,
}: {
  reactions: CommunityReaction[];
  targetId: string;
  targetType: "post" | "comment";
}) {
  const { run, pending } = useCommunityRun();
  const { canAct } = useCsrf();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reactions">
      {KINDS.map(({ kind, label, Icon }) => {
        const r = reactions.find((x) => x.kind === kind);
        const on = !!r?.active;
        return (
          <button
            key={kind}
            type="button"
            data-on={on}
            aria-pressed={on}
            aria-label={`${label}, ${r?.count ?? 0}`}
            title={canAct ? label : "Sign in to react"}
            disabled={pending || !canAct}
            onClick={() =>
              run(
                {
                  action: "reaction",
                  targetId,
                  targetType,
                  kind,
                  enabled: !on,
                },
                `${on ? "Removed" : "Added"} ${label.toLowerCase()}.`,
              )
            }
            className={`reaction inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60 ${on ? "border-accent bg-accent/20 font-medium" : "hover:bg-muted"}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono">{r?.count ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
