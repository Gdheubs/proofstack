import type { RepositoryData } from "@workspace/api-zod";
import type { Request } from "express";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";
import {
  transaction,
  audit,
  requireFresh,
  type AuthSession,
} from "./auth-sessions";
import {
  authorizeProject,
  projectReadWhere,
  memberAccessWhere,
  requireCommunityProfile,
  missing,
  denied,
  type CommunityDb,
} from "./community-policy";
import { managerWhere } from "./careers-policy";
import {
  repoInput,
  repoQuerySchema,
  repoError,
  uuid,
} from "./repository-input";
import {
  storageEnabled,
  repoPath,
  git,
  initialize,
  commitFile,
  syncRefs,
  quota,
  storageBytes,
  treeEntries,
  readSource,
  history,
} from "./repository-git";
const manager = `((p.owner_id=$1 AND (p.organization_id IS NULL OR ${memberAccessWhere("p.organization_id", "$1")})) OR ${managerWhere("p.organization_id", "$1")})`;
const writer = `(${manager} OR (EXISTS(SELECT 1 FROM community_contributors c WHERE c.project_id=p.id AND c.user_id=$1 AND c.status='active') AND (p.organization_id IS NULL OR ${memberAccessWhere("p.organization_id", "$1")})))`;
// Internal SQL aliases only; never pass request data as the viewer expression.
export const repositoryWriteWhere = (viewer: string) =>
  writer.replaceAll("$1", viewer);
const columns = `r.id,r.project_id AS "projectId",p.title AS "projectTitle",p.slug AS "projectSlug",CASE WHEN p.visibility='public' AND coalesce(op.visibility,'public')='public' THEN 'public' ELSE 'restricted' END AS visibility,r.default_branch AS "defaultBranch",r.quota_bytes::float8 AS "quotaBytes",r.created_at::text AS "createdAt",coalesce(${manager},false) AS "canManage",coalesce(${writer},false) AS "canWrite"`;
const joins = `FROM repositories r JOIN community_projects p ON p.id=r.project_id JOIN users owner ON owner.id=p.owner_id AND owner.status='active' LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id`;
export type RepositoryRow = {
  id: string;
  projectId: string;
  projectTitle: string;
  projectSlug: string;
  visibility: string;
  defaultBranch: string;
  quotaBytes: number;
  createdAt: string;
  canManage: boolean;
  canWrite: boolean;
};
export async function repositoryAccess(
  id: string,
  uid: string | null,
  db: CommunityDb = pool,
  lock = false,
): Promise<RepositoryRow> {
  const r = await db.query(
    `SELECT ${columns} ${joins} WHERE r.id=$2 AND ${projectReadWhere()} ${lock ? "FOR UPDATE OF r" : ""}`,
    [uid, id],
  );
  if (!r.rows[0]) throw missing();
  return r.rows[0];
}
export async function lockedRepository<T>(
  id: string,
  uid: string | null,
  fn: (
    repo: RepositoryRow,
    path: string,
    db: PoolClient,
    branches: { name: string; head: string }[],
  ) => Promise<T>,
) {
  return transaction(async (db) => {
    const repo = await repositoryAccess(id, uid, db, true);
    const path = await repoPath(id);
    const branches = (
      await db.query(
        "SELECT name,head FROM repository_branches WHERE repository_id=$1 ORDER BY name",
        [id],
      )
    ).rows;
    const tags = (
      await db.query(
        'SELECT tag AS name,"commit" AS head FROM repository_releases WHERE repository_id=$1',
        [id],
      )
    ).rows;
    await syncRefs(path, branches, tags);
    return fn(repo, path, db, branches);
  });
}
export async function getRepositories(
  raw: unknown,
  uid: string | null,
): Promise<RepositoryData> {
  const parsed = repoQuerySchema.safeParse(raw);
  if (!parsed.success) throw repoError("Invalid repository query.");
  const d = parsed.data;
  if (d.id)
    return lockedRepository(d.id, uid, async (repo, path, db, branches) => {
      const branch = branches.find(
        (b) => b.name === (d.branch ?? repo.defaultBranch),
      );
      if (!branch) throw repoError("Branch not found.", 404);
      const head = d.revision ?? branch.head;
      if (d.revision) {
        try {
          await git(path, ["merge-base", "--is-ancestor", head, branch.head]);
        } catch {
          throw repoError("Commit is not reachable from this branch.", 404);
        }
      }
      let file: {
        path: string;
        content: string;
        size: number;
        previewable: boolean;
      } | null = null;
      let folder = d.path;
      if (d.path) {
        const object = (await git(path, ["ls-tree", "-z", head, "--", d.path]))
          .toString()
          .split("\0")[0];
        if (!object || object.slice(object.indexOf("\t") + 1) !== d.path)
          throw repoError("Path not found.", 404);
        if (!object.startsWith("040000 tree ")) {
          file = { path: d.path, ...(await readSource(path, head, d.path)) };
          folder = d.path.includes("/")
            ? d.path.slice(0, d.path.lastIndexOf("/"))
            : "";
        }
      }
      const entries = await treeEntries(path, head, folder);
      const log = await history(path, head, d.offset);
      const tokens = uid
        ? (
            await db.query(
              `SELECT id,name,expires_at::text AS "expiresAt",created_at::text AS "createdAt",revoked_at IS NOT NULL AS revoked FROM repository_tokens WHERE repository_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 20`,
              [d.id, uid],
            )
          ).rows
        : [];
      return {
        enabled: storageEnabled(),
        repositories: [repo],
        projects: [],
        branches,
        branch: branch.name,
        head,
        folder,
        entries,
        file,
        ...log,
        tokens,
        usedBytes: await storageBytes(path),
        offset: d.offset,
      };
    });
  const rows = (
    await pool.query(
      `SELECT ${columns} ${joins} WHERE ${projectReadWhere()} AND ($2::uuid IS NULL OR p.id=$2) ORDER BY r.created_at DESC,r.id LIMIT 21 OFFSET $3`,
      [uid, d.projectId ?? null, d.offset],
    )
  ).rows;
  const projects = uid
    ? (
        await pool.query(
          `SELECT p.id,p.title FROM community_projects p LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id WHERE ${manager} AND NOT EXISTS(SELECT 1 FROM repositories r WHERE r.project_id=p.id) ORDER BY p.updated_at DESC LIMIT 50`,
          [uid],
        )
      ).rows
    : [];
  return {
    enabled: storageEnabled(),
    repositories: rows.slice(0, 20),
    projects,
    branches: [],
    branch: "",
    head: "",
    folder: "",
    entries: [],
    file: null,
    commits: [],
    tokens: [],
    usedBytes: 0,
    hasMore: rows.length > 20,
    offset: d.offset,
  };
}
export async function runRepositoryAction(
  req: Request,
  s: AuthSession,
  raw: unknown,
) {
  const d = repoInput(raw),
    uid = s.user.id;
  return transaction(async (db) => {
    const profile = await requireCommunityProfile(uid, db);
    let resultId: string;
    let token: string | undefined;
    if (d.action === "create") {
      const project = await authorizeProject(db, s, d.projectId, "edit");
      if (
        (
          await db.query("SELECT 1 FROM repositories WHERE project_id=$1", [
            d.projectId,
          ])
        ).rows.length
      )
        throw repoError("This project already has a repository.", 409);
      // Serialize creation per owner and cap total repositories to bound allocated storage.
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        project.owner_id,
      ]);
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM repositories r JOIN community_projects p ON p.id=r.project_id WHERE p.owner_id=$1",
          [project.owner_id],
        )
      ).rows[0].n;
      if (count >= 20)
        throw repoError("Repository limit reached (20 owned projects).", 409);
      resultId = randomUUID();
      const path = await repoPath(resultId, true);
      await initialize(path);
      const head = await commitFile(
        path,
        null,
        "README.md",
        "# " +
          profile.display_name.replace(/[\r\n]/g, " ") +
          "\n\nBuild something worth sharing.\n",
        "Initialize repository",
        { id: uid, name: profile.display_name },
      );
      await db.query("INSERT INTO repositories(id,project_id) VALUES($1,$2)", [
        resultId,
        d.projectId,
      ]);
      await db.query(
        `INSERT INTO repository_branches(repository_id,name,head) VALUES($1,'main',$2)`,
        [resultId, head],
      );
    } else {
      resultId = d.id;
      const initial = await repositoryAccess(d.id, uid, db);
      if (d.action === "commit" || d.action === "branch")
        await authorizeProject(db, s, initial.projectId, "contribute");
      const repo = await repositoryAccess(d.id, uid, db, true);
      if (d.action === "token-create") {
        requireFresh(s, true);
        const active = (
          await db.query(
            `SELECT count(*)::int AS n FROM repository_tokens WHERE user_id=$1 AND repository_id=$2 AND revoked_at IS NULL AND expires_at>now()`,
            [uid, d.id],
          )
        ).rows[0].n;
        if (active >= 10)
          throw repoError(
            "Revoke an existing token first (10 active tokens per repository).",
            409,
          );
        token = "psr_" + randomBytes(32).toString("base64url");
        await db.query(
          `INSERT INTO repository_tokens(repository_id,user_id,name,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 days')`,
          [d.id, uid, d.name, createHash("sha256").update(token).digest("hex")],
        );
      } else if (d.action === "token-revoke") {
        const row = await db.query(
          `UPDATE repository_tokens SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND repository_id=$2 AND user_id=$3 RETURNING id`,
          [d.tokenId, d.id, uid],
        );
        if (!row.rows.length) throw missing();
      } else {
        if (!repo.canWrite) throw denied();
        const from = d.action === "branch" ? d.from : d.branch;
        const branches = (
          await db.query(
            "SELECT name,head FROM repository_branches WHERE repository_id=$1",
            [d.id],
          )
        ).rows;
        const branch = branches.find((b) => b.name === from);
        if (!branch) throw repoError("Branch not found.", 404);
        if (branch.head !== d.expectedHead)
          throw repoError(
            "This branch changed. Reload and review the latest version before saving.",
            409,
          );
        if (d.action === "branch") {
          if (branches.length >= 50)
            throw repoError("Branch limit reached (50).", 409);
          if (
            branches.some(
              (b) =>
                b.name === d.branch ||
                b.name.startsWith(d.branch + "/") ||
                d.branch.startsWith(b.name + "/"),
            )
          )
            throw repoError(
              "Branch already exists or conflicts with another branch path.",
              409,
            );
          await db.query(
            "INSERT INTO repository_branches(repository_id,name,head) VALUES($1,$2,$3)",
            [d.id, d.branch, branch.head],
          );
        } else {
          if (d.branch === repo.defaultBranch)
            throw repoError(
              "The default branch requires a reviewed pull request. Create a working branch first.",
              403,
            );
          const path = await repoPath(d.id);
          await quota(path, repo.quotaBytes);
          if (d.remove) await readSource(path, branch.head, d.path);
          const head = await commitFile(
            path,
            branch.head,
            d.path,
            d.content,
            d.message,
            { id: uid, name: profile.display_name },
            d.remove,
          );
          await quota(path, repo.quotaBytes);
          await db.query(
            "UPDATE repository_branches SET head=$3,updated_at=now() WHERE repository_id=$1 AND name=$2",
            [d.id, d.branch, head],
          );
        }
      }
    }
    await audit(req, "repository." + d.action, uid, resultId, {}, db);
    return {
      message:
        d.action === "token-create"
          ? "Copy this read token now. It will not be shown again."
          : "Repository updated",
      id: resultId,
      ...(token ? { token } : {}),
    };
  });
}
export async function tokenUser(raw: string | undefined, id: string) {
  if (!raw) return null;
  let token = "";
  if (raw.startsWith("Bearer ")) token = raw.slice(7);
  else if (raw.startsWith("Basic ")) {
    const decoded = Buffer.from(raw.slice(6), "base64").toString();
    const separator = decoded.indexOf(":");
    if (separator >= 0) token = decoded.slice(separator + 1);
  }
  if (!/^psr_[A-Za-z0-9_-]{43}$/.test(token))
    throw repoError("Invalid or expired repository credential.", 401);
  const r = await pool.query(
    `SELECT t.user_id FROM repository_tokens t JOIN users u ON u.id=t.user_id AND u.status='active' AND u.mfa_recovery_required=false WHERE t.repository_id=$1 AND t.token_hash=$2 AND t.revoked_at IS NULL AND t.expires_at>now()`,
    [id, createHash("sha256").update(token).digest("hex")],
  );
  if (!r.rows[0])
    throw repoError("Invalid or expired repository credential.", 401);
  return r.rows[0].user_id as string;
}
export async function validateRepositoryId(raw: string) {
  if (!uuid.safeParse(raw).success) throw missing();
  return raw;
}
