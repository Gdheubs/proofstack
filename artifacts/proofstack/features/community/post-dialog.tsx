"use client";
import { useEffect, useState } from "react";
import type { CommunityPost } from "@workspace/api-client-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useCommunityList, useCommunityRun } from "@/hooks/use-community";
import { csv } from "@/lib/community";
import { AssistInline } from "./assist";
import { Fld, FormDialog, selectCls } from "./ui";

export function PostDialog({
  open,
  onOpenChange,
  post,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  post?: CommunityPost;
}) {
  const { run, pending, error } = useCommunityRun();
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [projectId, setProjectId] = useState("");
  const mine = useCommunityList({ view: "projects", filter: "mine" }, open);
  const projects = mine.pages.flatMap((p) => p.projects);
  useEffect(() => {
    if (open) {
      setBody(post?.body ?? "");
      setTags(post?.tags.join(", ") ?? "");
      setProjectId(post?.projectId ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post?.id]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={post ? "Edit post" : "Share an update"}
      description="Mention people with @handle. Tags are comma separated."
      submitLabel={post ? "Save changes" : "Post"}
      pending={pending}
      error={error}
      onSubmit={async () => {
        const r = await run(
          {
            action: "post-save",
            id: post?.id,
            body: body.trim(),
            tags: csv(tags),
            projectId: projectId || null,
          },
          post ? "Post updated." : "Posted.",
        );
        if (r) onOpenChange(false);
      }}
    >
      <Fld label="What did you build, learn, or ship?">
        <Textarea
          required
          rows={6}
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Shipped the retry queue. Dropped p95 from 840ms to 310ms. Thanks @someone for the review."
        />
      </Fld>
      <Fld label="Tags">
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="postgres, performance"
        />
      </Fld>
      <Fld
        label="Related project"
        hint="Optional. Only your own projects appear here."
      >
        <select
          className={selectCls}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </Fld>
      <AssistInline
        tasks={["suggested-tags"]}
        text={body}
        compact
        applyLabel="Use these tags"
        onApply={(d) => setTags(csv([tags, ...d.tags].join(",")).join(", "))}
      />
    </FormDialog>
  );
}
