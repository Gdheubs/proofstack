"use client";
import { useState } from "react";
import type { RepositoryData } from "@workspace/api-client-react";
import { ExternalLink, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { card, field } from "@/features/careers/shared";
import { useRepositoryRun } from "@/hooks/use-repository";
import { useSession } from "@/hooks/use-auth";
import { TurnstileField } from "@/features/auth/turnstile";
import { ActionForm } from "./action-form";

// Publishes one branch's static site (HTML, CSS, JS, images) as the
// project's live demo on the separate demo site. Owners and managers only.
export function DemoPanel({ data: d }: { data: RepositoryData }) {
  const repo = d.repositories[0]!;
  const a = useRepositoryRun();
  const [branch, setBranch] = useState(d.branch);
  const [humanToken, setHumanToken] = useState<string | null>(null);
  const siteKey = useSession().data?.capabilities?.turnstileSiteKey ?? "";
  if (!d.demoAvailable || !repo.canManage) return null;
  const isPublic = repo.visibility === "public";
  return (
    <section className={card} aria-label="Live demo">
      <h2 className="flex items-center gap-2 font-semibold">
        <Rocket className="h-4 w-4" aria-hidden="true" />
        Live demo
      </h2>
      {d.demoUrl ? (
        <a
          href={d.demoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 break-all text-sm underline underline-offset-2"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {d.demoUrl}
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">
          Publish this repository&apos;s website (an index.html with its CSS, JS
          and images) as a live demo. The project&apos;s Demo URL fills itself.
        </p>
      )}
      {!isPublic ? (
        <p className="text-sm text-muted-foreground">
          Anyone can open a demo, so only public projects can publish one. Make
          the project public to publish.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run({
              action: "demo-publish",
              id: repo.id,
              branch,
              ...(humanToken ? { humanToken } : {}),
            });
          }}
        >
          <label className="block text-sm">
            Branch
            <select
              className={field + " mt-1"}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              {d.branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <TurnstileField
            siteKey={siteKey}
            action="demo-publish"
            onToken={setHumanToken}
          />
          <ActionForm
            action={a}
            label={d.demoUrl ? "Publish again" : "Publish demo"}
          >
            <p className="text-xs text-muted-foreground">
              Uses index.html at the top of the branch, or in dist, build,
              public, docs or site. Static files only: up to 500 files and 25
              MB. Publishing replaces the previous demo.
            </p>
          </ActionForm>
        </form>
      )}
      {d.demoUrl && (
        <Button
          variant="ghost"
          size="sm"
          disabled={a.pending}
          onClick={() => void a.run({ action: "demo-unpublish", id: repo.id })}
        >
          Unpublish demo
        </Button>
      )}
    </section>
  );
}
