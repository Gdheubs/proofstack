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
  receivePackCommands,
  repoNameSchema,
  ownerHandleSchema,
} from "./repository-input";
import { authOrigin } from "../lib/auth-config";
import { RESERVED_HANDLES } from "./community-input";
import { authLimit } from "./auth-limits";
import {
  demoFiles,
  demoOrigin,
  demoUrl,
  publishDemo,
  unpublishDemo,
  type DemoFile,
} from "./repository-demo";
import {
  storageEnabled,
  persistRepository,
  repoPath,
  git,
  initialize,
  commitFile,
  commitChanges,
  syncRefs,
  quota,
  storageBytes,
  treeEntries,
  readSource,
  history,
  validatePushedTree,
} from "./repository-git";
const manager = `((p.owner_id=$1 AND (p.organization_id IS NULL OR ${memberAccessWhere("p.organization_id", "$1")})) OR ${managerWhere("p.organization_id", "$1")})`;
const writer = `(${manager} OR (EXISTS(SELECT 1 FROM community_contributors c WHERE c.project_id=p.id AND c.user_id=$1 AND c.status='active') AND (p.organization_id IS NULL OR ${memberAccessWhere("p.organization_id", "$1")})))`;
// Internal SQL aliases only; never pass request data as the viewer expression.
export const repositoryWriteWhere = (viewer: string) =>
  writer.replaceAll("$1", viewer);
const columns = `r.id,r.name,(SELECT handle FROM profiles WHERE user_id=r.owner_id) AS "ownerHandle",r.project_id AS "projectId",p.title AS "projectTitle",p.slug AS "projectSlug",CASE WHEN p.visibility='public' AND coalesce(op.visibility,'public')='public' THEN 'public' ELSE 'restricted' END AS visibility,r.default_branch AS "defaultBranch",r.quota_bytes::float8 AS "quotaBytes",r.created_at::text AS "createdAt",coalesce(${manager},false) AS "canManage",coalesce(${writer},false) AS "canWrite"`;
const joins = `FROM repositories r JOIN community_projects p ON p.id=r.project_id JOIN users owner ON owner.id=p.owner_id AND owner.status='active' LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id`;
export type RepositoryRow = {
  id: string;
  name: string;
  ownerHandle: string | null;
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
    const result = await fn(repo, path, db, branches);
    // Pushes write objects here; saved before the transaction commits.
    await persistRepository(id, db);
    return result;
  });
}
export async function getRepositories(
  raw: unknown,
  uid: string | null,
): Promise<RepositoryData> {
  const parsed = repoQuerySchema.safeParse(raw);
  if (!parsed.success) throw repoError("Invalid repository query.");
  const d = parsed.data;
  if (!d.id && d.owner && d.name)
    d.id = await repositoryIdByName(d.owner, d.name);
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
              `SELECT id,name,CASE WHEN token_hash LIKE 'write:%' THEN 'write' ELSE 'read' END AS scope,expires_at::text AS "expiresAt",created_at::text AS "createdAt",revoked_at IS NOT NULL AS revoked FROM repository_tokens WHERE repository_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 20`,
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
        // Publishing needs the demo site; the URL is the project's demo when
        // it is this repository's published demo.
        demoAvailable: !!demoOrigin(),
        demoUrl: await (async () => {
          const origin = demoOrigin();
          if (!origin || !repo.ownerHandle) return null;
          const url = demoUrl(origin, repo.ownerHandle, repo.name);
          const current = (
            await db.query(
              "SELECT demo_url FROM community_projects WHERE id=$1",
              [repo.projectId],
            )
          ).rows[0]?.demo_url;
          return current === url ? url : null;
        })(),
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
          `SELECT p.id,p.title FROM community_projects p LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id WHERE ${manager} AND ($2::uuid IS NULL OR p.id=$2) AND NOT EXISTS(SELECT 1 FROM repositories r WHERE r.project_id=p.id) ORDER BY p.updated_at DESC LIMIT 50`,
          [uid, d.projectId ?? null],
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
export async function pushRepository(
  req: Request,
  id: string,
  uid: string,
  body: Buffer,
) {
  const updates = receivePackCommands(body);
  return lockedRepository(id, uid, async (repo, path, db, branches) => {
    if (!repo.canWrite) throw denied();
    const defaultHead = branches.find(
      (branch) => branch.name === repo.defaultBranch,
    )?.head;
    if (!defaultHead) throw repoError("Default branch is unavailable.", 503);
    const update = updates[0];
    if (update.branch === repo.defaultBranch)
      throw repoError("Push to the protected default branch is disabled.", 403);
    const current = branches.find((branch) => branch.name === update.branch);
    let base: string;
    if (update.oldHead === "0".repeat(40)) {
      if (current) throw repoError("Branch already exists.", 409);
      if (
        branches.some(
          (branch) =>
            branch.name.startsWith(update.branch + "/") ||
            update.branch.startsWith(branch.name + "/"),
        )
      )
        throw repoError("Branch conflicts with an existing branch path.", 409);
      if (branches.length >= 50)
        throw repoError("Branch limit reached (50).", 409);
      base = defaultHead;
    } else {
      if (!current || current.head !== update.oldHead)
        throw repoError(
          "Branch changed; fetch and retry from its latest head.",
          409,
        );
      base = current.head;
    }
    const output = await git(
      path,
      ["receive-pack", "--stateless-rpc", path],
      body,
      {},
      8 * 1024 * 1024,
    );
    try {
      await git(path, ["merge-base", "--is-ancestor", base, update.newHead]);
    } catch {
      throw repoError(
        "Push must fast-forward from the authorized branch head.",
        409,
      );
    }
    await validatePushedTree(path, update.newHead);
    await quota(path, repo.quotaBytes);
    const result =
      update.oldHead === "0".repeat(40)
        ? await db.query(
            "INSERT INTO repository_branches(repository_id,name,head) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING name",
            [id, update.branch, update.newHead],
          )
        : await db.query(
            "UPDATE repository_branches SET head=$3,updated_at=now() WHERE repository_id=$1 AND name=$2 AND head=$4 RETURNING name",
            [id, update.branch, update.newHead, update.oldHead],
          );
    if (!result.rows.length)
      throw repoError("Branch changed while saving the push.", 409);
    await audit(req, "repository.push", uid, id, { branch: update.branch }, db);
    return output;
  });
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
    let demoMessage: string | undefined;
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
      const ownerHandle = (
        await db.query("SELECT handle FROM profiles WHERE user_id=$1", [
          project.owner_id,
        ])
      ).rows[0]?.handle as string | undefined;
      if (ownerHandle && RESERVED_HANDLES.includes(ownerHandle.toLowerCase()))
        throw repoError(
          `Your username "${ownerHandle}" is also the name of a ProofStack page, so its repository addresses would not open. Choose a new username in Settings, Profile, then create the repository.`,
          409,
        );
      const name = d.name ?? project.slug;
      if (!repoNameSchema.safeParse(name).success)
        throw repoError("Choose a repository name.", 400);
      if (
        (
          await db.query(
            "SELECT 1 FROM repositories WHERE owner_id=$1 AND lower(name)=lower($2)",
            [project.owner_id, name],
          )
        ).rows.length
      )
        throw repoError(
          "You already have a repository with this name. Choose another.",
          409,
        );
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
      await db.query(
        "INSERT INTO repositories(id,project_id,owner_id,name) VALUES($1,$2,$3,$4)",
        [resultId, d.projectId, project.owner_id, name],
      );
      // The project's Repository URL fills itself unless one was set.
      const handle = (
        await db.query("SELECT handle FROM profiles WHERE user_id=$1", [
          project.owner_id,
        ])
      ).rows[0]?.handle;
      let origin = "";
      try {
        origin = authOrigin();
      } catch {
        // Without a configured site address the URL is left for the member.
      }
      if (handle && origin)
        await db.query(
          "UPDATE community_projects SET repository_url=$2,updated_at=now() WHERE id=$1 AND repository_url=''",
          [d.projectId, `${origin}/${handle}/${name}`],
        );
      await db.query(
        `INSERT INTO repository_branches(repository_id,name,head) VALUES($1,'main',$2)`,
        [resultId, head],
      );
    } else {
      resultId = d.id;
      const initial = await repositoryAccess(d.id, uid, db);
      if (
        d.action === "commit" ||
        d.action === "commit-files" ||
        d.action === "branch"
      )
        await authorizeProject(db, s, initial.projectId, "contribute");
      const repo = await repositoryAccess(d.id, uid, db, true);
      if (d.action === "token-create") {
        requireFresh(s, true);
        if (d.scope === "write" && !repo.canWrite) throw denied();
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
        token =
          (d.scope === "write" ? "psw_" : "psr_") +
          randomBytes(32).toString("base64url");
        const digest = createHash("sha256").update(token).digest("hex");
        await db.query(
          `INSERT INTO repository_tokens(repository_id,user_id,name,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 days')`,
          [d.id, uid, d.name, `${d.scope}:${digest}`],
        );
      } else if (d.action === "demo-publish" || d.action === "demo-unpublish") {
        if (!repo.canManage) throw denied();
        const origin = demoOrigin();
        if (!origin) throw repoError("Demo hosting is not set up yet.", 503);
        await authLimit(req, "demo-publish", uid, 20, 3600);
        if (!repo.ownerHandle)
          throw repoError("Choose a username before publishing a demo.", 409);
        const url = demoUrl(origin, repo.ownerHandle, repo.name);
        if (d.action === "demo-unpublish") {
          await unpublishDemo(repo.ownerHandle, repo.name);
          await db.query(
            "UPDATE community_projects SET demo_url='',updated_at=now() WHERE id=$1 AND demo_url=$2",
            [repo.projectId, url],
          );
          demoMessage = "Demo unpublished";
        } else {
          // Demos are public, so only public projects may publish one.
          if (repo.visibility !== "public")
            throw repoError(
              "Only public projects can publish a demo, because anyone can open a demo. Make the project public first.",
              403,
            );
          const head = (
            await db.query(
              "SELECT head FROM repository_branches WHERE repository_id=$1 AND name=$2",
              [d.id, d.branch],
            )
          ).rows[0]?.head as string | undefined;
          if (!head) throw repoError("Branch not found.", 404);
          const path = await repoPath(d.id);
          const listed = (await git(path, ["ls-tree", "-r", "-z", "-l", head]))
            .toString("utf8")
            .split("\0")
            .filter(Boolean)
            .flatMap((line): DemoFile[] => {
              const tab = line.indexOf("\t");
              const [mode, type, oid, size] = line
                .slice(0, tab)
                .trim()
                .split(/\s+/);
              return type === "blob" && (mode === "100644" || mode === "100755")
                ? [
                    {
                      path: line.slice(tab + 1),
                      oid: oid!,
                      size: Number(size) || 0,
                    },
                  ]
                : [];
            });
          const { files } = demoFiles(listed);
          await publishDemo(repo.ownerHandle, repo.name, files, (oid) =>
            git(path, ["cat-file", "blob", oid], "", {}, 16 * 1024 * 1024),
          );
          // The Demo URL fills itself unless the member linked elsewhere.
          await db.query(
            "UPDATE community_projects SET demo_url=$2,updated_at=now() WHERE id=$1 AND (demo_url='' OR demo_url LIKE $3)",
            [repo.projectId, url, origin + "/%"],
          );
          demoMessage = `Demo published at ${url}`;
        }
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
          const author = { id: uid, name: profile.display_name };
          let head: string;
          if (d.action === "commit-files") {
            // Deleting a path that does not exist is refused, as for one file.
            for (const change of d.changes)
              if (change.content === null)
                await readSource(path, branch.head, change.path);
            head = await commitChanges(
              path,
              branch.head,
              d.changes,
              d.message,
              author,
            );
          } else {
            if (d.remove) await readSource(path, branch.head, d.path);
            head = await commitFile(
              path,
              branch.head,
              d.path,
              d.content,
              d.message,
              author,
              d.remove,
            );
          }
          await quota(path, repo.quotaBytes);
          await db.query(
            "UPDATE repository_branches SET head=$3,updated_at=now() WHERE repository_id=$1 AND name=$2",
            [d.id, d.branch, head],
          );
        }
      }
    }
    await persistRepository(resultId, db);
    await audit(req, "repository." + d.action, uid, resultId, {}, db);
    return {
      message:
        demoMessage ??
        (d.action === "token-create"
          ? `Copy this ${d.scope} token now. It will not be shown again.`
          : "Repository updated"),
      id: resultId,
      ...(token ? { token } : {}),
    };
  });
}
export async function tokenCredential(raw: string | undefined, id: string) {
  if (!raw) return null;
  let token = "";
  if (raw.startsWith("Bearer ")) token = raw.slice(7);
  else if (raw.startsWith("Basic ")) {
    const decoded = Buffer.from(raw.slice(6), "base64").toString();
    const separator = decoded.indexOf(":");
    if (separator >= 0) token = decoded.slice(separator + 1);
  }
  const match = /^(psr|psw)_([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) throw repoError("Invalid or expired repository credential.", 401);
  const requestedScope = match[1] === "psw" ? "write" : "read";
  const digest = createHash("sha256").update(token).digest("hex");
  const hashes =
    requestedScope === "read"
      ? [`read:${digest}`, digest]
      : [`write:${digest}`];
  const r = await pool.query(
    `SELECT t.user_id,CASE WHEN t.token_hash LIKE 'write:%' THEN 'write' ELSE 'read' END AS scope FROM repository_tokens t JOIN users u ON u.id=t.user_id AND u.status='active' AND u.mfa_recovery_required=false WHERE t.repository_id=$1 AND t.token_hash=ANY($2::text[]) AND t.revoked_at IS NULL AND t.expires_at>now()`,
    [id, hashes],
  );
  if (!r.rows[0])
    throw repoError("Invalid or expired repository credential.", 401);
  return {
    userId: r.rows[0].user_id as string,
    scope: r.rows[0].scope as "read" | "write",
  };
}
export async function tokenUser(raw: string | undefined, id: string) {
  return (await tokenCredential(raw, id))?.userId ?? null;
}
// The repository at /<owner handle>/<name>, ignoring case. Read access is
// checked by the caller, as for an id.
export async function repositoryIdByName(owner: string, name: string) {
  if (
    !ownerHandleSchema.safeParse(owner).success ||
    !repoNameSchema.safeParse(name).success
  )
    throw missing();
  const row = (
    await pool.query(
      "SELECT r.id FROM repositories r JOIN profiles p ON p.user_id=r.owner_id WHERE lower(p.handle)=lower($1) AND lower(r.name)=lower($2)",
      [owner, name],
    )
  ).rows[0];
  if (!row) throw missing();
  return row.id as string;
}
export async function validateRepositoryId(raw: string) {
  if (!uuid.safeParse(raw).success) throw missing();
  return raw;
}
