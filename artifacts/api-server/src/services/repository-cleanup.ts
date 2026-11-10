import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ApiError } from "../lib/errors";
import { authOrigin } from "../lib/auth-config";
import { demoOrigin, moveDemo, unpublishDemo } from "./repository-demo";
import { deleteRepositoryBundle } from "./repository-store";

// Keeps stored code and public demos in step with what members can see.
// Every function runs inside the caller's transaction and throws when storage
// cannot be cleaned, so a deletion never leaves public or private leftovers.
type Db = {
  query: (
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};
type Repo = { id: string; name: string; handle: string | null };

const REPOS = `SELECT r.id,r.name,pr.handle FROM repositories r LEFT JOIN profiles pr ON pr.user_id=r.owner_id`;

async function forget(repos: Repo[]) {
  for (const repo of repos) {
    if (repo.handle && demoOrigin())
      await unpublishDemo(repo.handle, repo.name);
    await deleteRepositoryBundle(repo.id);
    const root = process.env.REPOSITORY_ROOT;
    if (root)
      await rm(join(resolve(root), `${repo.id}.git`), {
        recursive: true,
        force: true,
      }).catch(() => {});
  }
}

// Before a project is deleted: its repository's code and demo go too.
export async function forgetProjectRepositories(db: Db, projectId: string) {
  const repos = (await db.query(`${REPOS} WHERE r.project_id=$1`, [projectId]))
    .rows as Repo[];
  await forget(repos);
}

// Before an account is deleted: every repository it owns, and any repository
// in a project it owns.
export async function forgetAccountRepositories(db: Db, userId: string) {
  const repos = (
    await db.query(
      `${REPOS} JOIN community_projects p ON p.id=r.project_id WHERE r.owner_id=$1 OR p.owner_id=$1`,
      [userId],
    )
  ).rows as Repo[];
  await forget(repos);
}

// When projects stop being public (the project or its organization): their
// demos come down, because anyone can open a demo.
export async function unpublishHiddenDemos(
  db: Db,
  where: { projectId?: string; organizationId?: string },
) {
  const origin = demoOrigin();
  if (!origin) return;
  const repos = (
    await db.query(
      `${REPOS} JOIN community_projects p ON p.id=r.project_id
       WHERE ($1::uuid IS NULL OR p.id=$1) AND ($2::uuid IS NULL OR p.organization_id=$2)
       AND p.demo_url LIKE $3`,
      [where.projectId ?? null, where.organizationId ?? null, origin + "/%"],
    )
  ).rows as Repo[];
  for (const repo of repos)
    if (repo.handle) await unpublishDemo(repo.handle, repo.name);
  await db.query(
    `UPDATE community_projects SET demo_url='',updated_at=now()
     WHERE ($1::uuid IS NULL OR id=$1) AND ($2::uuid IS NULL OR organization_id=$2) AND demo_url LIKE $3`,
    [where.projectId ?? null, where.organizationId ?? null, origin + "/%"],
  );
}

// A username change: demos move to the new address and saved Repository and
// Demo URLs follow. The old name is retired by the caller.
export async function renameOwnerAddresses(
  db: Db,
  userId: string,
  from: string,
  to: string,
) {
  const repos = (
    await db.query(`SELECT id,name FROM repositories WHERE owner_id=$1`, [
      userId,
    ])
  ).rows as { id: string; name: string }[];
  const demos = demoOrigin();
  if (demos) for (const repo of repos) await moveDemo(from, to, repo.name);
  let site = "";
  try {
    site = authOrigin();
  } catch {
    // Without a site address, saved links are left as they are.
  }
  const rewrites: [string, string][] = [];
  if (site) rewrites.push([`${site}/${from}/`, `${site}/${to}/`]);
  if (demos)
    rewrites.push([
      `${demos}/${from.toLowerCase()}/`,
      `${demos}/${to.toLowerCase()}/`,
    ]);
  for (const [a, b] of rewrites) {
    await db.query(
      `UPDATE community_projects p SET repository_url=$3||substr(repository_url,length($2)+1),updated_at=now()
       FROM repositories r WHERE r.project_id=p.id AND r.owner_id=$1 AND lower(p.repository_url) LIKE lower($2)||'%'`,
      [userId, a, b],
    );
    await db.query(
      `UPDATE community_projects p SET demo_url=$3||substr(demo_url,length($2)+1),updated_at=now()
       FROM repositories r WHERE r.project_id=p.id AND r.owner_id=$1 AND lower(p.demo_url) LIKE lower($2)||'%'`,
      [userId, a, b],
    );
  }
}

// Usernames given up in the last 90 days stay with their previous owner.
export async function assertHandleAvailable(
  db: Db,
  userId: string,
  handle: string,
) {
  const held = (
    await db.query(
      `SELECT retired_at FROM retired_handles WHERE handle=lower($1)
       AND retired_at>now()-interval '90 days' AND user_id IS DISTINCT FROM $2`,
      [handle, userId],
    )
  ).rows[0];
  if (held)
    throw new ApiError(
      409,
      "HANDLE_RECENTLY_USED",
      "This username was used recently and is reserved for 90 days. Choose another.",
    );
}

export async function retireHandle(
  db: Db,
  userId: string | null,
  handle: string,
) {
  await db.query(
    `INSERT INTO retired_handles(handle,user_id,retired_at) VALUES(lower($1),$2,now())
     ON CONFLICT(handle) DO UPDATE SET user_id=EXCLUDED.user_id,retired_at=now()`,
    [handle, userId],
  );
}
