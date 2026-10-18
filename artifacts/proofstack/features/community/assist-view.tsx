"use client";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/features/auth/shared";
import { CopyButton } from "@/features/auth/shared";
import { AssistInline, type AssistTask } from "./assist";
import { PageHead } from "./ui";

const ALL: AssistTask[] = [
  "profile-summary",
  "project-summary",
  "skill-extraction",
  "project-categorization",
  "suggested-tags",
  "documentation-assistance",
];

export function AssistView() {
  const [text, setText] = useState("");
  const [copy, setCopy] = useState("");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHead eyebrow="Assist" title="A second pair of eyes" />
      <Notice tone="warn">
        Assistance is a drafting aid. It is unverified, never rates
        anyone&apos;s competence, and each request may use AI credits. Nothing
        runs until you press Draft and nothing is published until you save it
        yourself.
      </Notice>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Your text (20 to 12,000 characters)
        </span>
        <Textarea
          rows={10}
          maxLength={12000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a bio, README section, or project description."
        />
        <span className="block text-right font-mono text-xs text-muted-foreground">
          {text.length}/12000
        </span>
      </label>
      <AssistInline
        tasks={ALL}
        text={text}
        applyLabel="Keep draft"
        onApply={(d) =>
          setCopy(
            [d.content, d.skills.join(", "), d.tags.join(", "), d.category]
              .filter(Boolean)
              .join("\n"),
          )
        }
      />
      {copy && (
        <div className="space-y-2 rounded-md border bg-card p-4">
          <p className="text-sm font-medium">Kept draft</p>
          <p className="whitespace-pre-wrap text-sm">{copy}</p>
          <div className="flex items-center gap-3">
            <CopyButton text={copy} label="Copy draft" />
            <span className="text-xs text-muted-foreground">
              Paste it into your profile or project editor; both also offer
              assistance inline.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
