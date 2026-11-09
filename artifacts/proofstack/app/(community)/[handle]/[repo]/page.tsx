import type { Metadata } from "next";
import { RepositoryByName } from "@/features/repositories/repository-by-name";

// A ProofStack repository's address: /<owner handle>/<repository name>.
// Static routes (/settings/profile, /projects/x, …) take precedence.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; repo: string }>;
}): Promise<Metadata> {
  const { handle, repo } = await params;
  return { title: `${decodeURIComponent(handle)}/${decodeURIComponent(repo)}` };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string; repo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle, repo } = await params;
  const q = await searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : undefined;
  return (
    <RepositoryByName
      owner={decodeURIComponent(handle)}
      name={decodeURIComponent(repo)}
      branch={one(q.branch)}
      path={one(q.path)}
      revision={one(q.revision)}
    />
  );
}
