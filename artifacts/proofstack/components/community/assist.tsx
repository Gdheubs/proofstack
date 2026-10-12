"use client";
import { useState } from "react";
import type { CommunityDraft } from "@workspace/api-client-react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/auth/shared";
import { errInfo } from "@/hooks/use-auth";
import { useCommunityAssist, useCsrf } from "@/hooks/use-community";
import { Tags, selectCls } from "./ui";

export type AssistTask =
  | "profile-summary"
  | "project-summary"
  | "skill-extraction"
  | "project-categorization"
  | "suggested-tags"
  | "documentation-assistance";

export const TASK_LABEL: Record<AssistTask, string> = {
  "profile-summary": "Profile summary",
  "project-summary": "Project summary",
  "skill-extraction": "Skill extraction",
  "project-categorization": "Project categorization",
  "suggested-tags": "Suggested tags",
  "documentation-assistance": "Documentation assistance",
};

export function AssistInline({
  tasks,
  text,
  onApply,
  applyLabel = "Apply to form",
  compact,
}: {
  tasks: AssistTask[];
  text: string;
  onApply?: (d: CommunityDraft, task: AssistTask) => void;
  applyLabel?: string;
  compact?: boolean;
}) {
  const [task, setTask] = useState<AssistTask>(tasks[0]);
  const [draft, setDraft] = useState<{
    d: CommunityDraft;
    task: AssistTask;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { assist, pending } = useCommunityAssist();
  const { canAct } = useCsrf();
  const short = text.trim().length < 20;

  const go = async () => {
    setErr(null);
    setDraft(null);
    try {
      setDraft({
        d: await assist({ task, text: text.trim().slice(0, 12000) }),
        task,
      });
    } catch (e) {
      setErr(errInfo(e).message);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed border-accent/70 bg-accent/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
        <span className="text-sm font-medium">AI assistance</span>
        {tasks.length > 1 && (
          <select
            aria-label="Assistance task"
            className={`${selectCls} w-auto`}
            value={task}
            onChange={(e) => setTask(e.target.value as AssistTask)}
          >
            {tasks.map((t) => (
              <option key={t} value={t}>
                {TASK_LABEL[t]}
              </option>
            ))}
          </select>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={go}
          disabled={pending || short || !canAct}
        >
          {pending
            ? "Drafting..."
            : tasks.length > 1
              ? "Draft"
              : TASK_LABEL[task]}
        </Button>
      </div>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Runs only when you press the button, sends the text above, and may use
          AI credits. Nothing is published until you apply and save.
        </p>
      )}
      {!canAct && <p className="text-xs">Sign in to use assistance.</p>}
      {canAct && short && (
        <p className="text-xs text-muted-foreground">
          Write at least 20 characters first so there is something to work with.
        </p>
      )}
      {err && <Notice tone="error">{err}</Notice>}
      {draft && (
        <div className="space-y-3 rounded-md border bg-card p-3 text-sm">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Draft for your review · {TASK_LABEL[draft.task]}
          </p>
          {draft.d.content && (
            <p className="whitespace-pre-wrap">{draft.d.content}</p>
          )}
          {draft.d.category && (
            <p>
              <span className="text-muted-foreground">Category: </span>
              {draft.d.category}
            </p>
          )}
          {draft.d.skills.length > 0 && <Tags items={draft.d.skills} />}
          {draft.d.tags.length > 0 && <Tags items={draft.d.tags} />}
          <Notice tone="warn">
            {draft.d.disclaimer} Unverified: this is not an assessment of
            technical competence.
          </Notice>
          <div className="flex gap-2">
            {onApply && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onApply(draft.d, draft.task);
                  setDraft(null);
                }}
              >
                {applyLabel}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraft(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
