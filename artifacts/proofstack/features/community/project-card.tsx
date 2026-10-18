import Link from "next/link";
import type { CommunityProject } from "@workspace/api-client-react";
import { Lock } from "lucide-react";
import { assetUrl } from "@/lib/community";
import { Tags } from "./ui";

export function ProjectCard({ project: p }: { project: CommunityProject }) {
  return (
    <article className="group relative overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md">
      {p.screenshots[0] && (
        <img
          src={assetUrl(p.screenshots[0])}
          alt=""
          loading="lazy"
          className="aspect-[16/8] w-full border-b object-cover"
        />
      )}
      <div className="space-y-2 p-4">
        <h3 className="text-lg font-semibold">
          <Link
            href={`/projects/${p.slug}`}
            className="after:absolute after:inset-0 hover:underline"
          >
            {p.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {p.description || "No description yet."}
        </p>
        <Tags items={p.technologies.slice(0, 6)} />
        <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          {p.visibility === "organization" && <Lock className="h-3 w-3" />}
          by @{p.owner.handle} ·{" "}
          {p.contributors.filter((c) => c.status === "active").length}{" "}
          contributors
        </p>
      </div>
    </article>
  );
}
