import type { Request } from "express";
import { z } from "zod/v3";
import { pool } from "@workspace/db";
import { ApiError } from "../lib/errors";
import type { AuthSession } from "./auth-sessions";
import { disconnectGithub, githubRequest, requireGithub } from "./github";
import {
  branchSchema,
  headSchema,
  pathSchema,
  MAX_REPOSITORY_FILE_BYTES,
  uuid,
} from "./repository-input";
import { listFiles, readSource, storageEnabled } from "./repository-git";
import {
  lockedRepository,
  repositoryAccess,
  repositoryWriteWhere,
  runRepositoryAction,
} from "./repositories";
import { projectReadWhere } from "./community-policy";

// The code editor works on two sources through one interface: the user's
// GitHub repositories and ProofStack-hosted repositories.
export const MAX_EDITOR_CHANGES = 100;
export const MAX_EDITOR_COMMIT_BYTES = 5 * 1024 * 1024;
export const MAX_EDITOR_FILES = 10000;

const source = z.enum(["github", "hosted"]);
const githubRepo = z
  .string()
  .max(140)
  .regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/)
  .refine((v) => !v.split("/")[1]!.startsWith("."), "Invalid repository");
const hasControl = (value: string) =>
  Array.from(value).some(
    (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === "\\",
  );
// Repository paths: relative, no empty, "." or ".." segments, no control
// characters or backslashes.
export const editorPath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (v) =>
      !hasControl(v) &&
      v.split("/").every((part) => part && part !== "." && part !== ".."),
    "Invalid file path",
  );
const repoFor = (src: "github" | "hosted", repo: string) =>
  (src === "github" ? githubRepo : uuid).parse(repo);
const invalid = () =>
  new ApiError(400, "INVALID_EDITOR_INPUT", "Check the editor request");

const location = z
  .object({ source, repo: z.string().min(1).max(140) })
  .strict();
const branchQuery = location.extend({ branch: branchSchema }).strict();
const fileQuery = branchQuery.extend({ path: editorPath }).strict();
export const commitInput = z
  .object({
    source,
    repo: z.string().min(1).max(140),
    branch: branchSchema,
    expectedHead: headSchema,
    newBranch: branchSchema.optional(),
    message: z
      .string()
      .trim()
      .min(3)
      .max(200)
      .refine((v) => !/[\r\n]/.test(v), "Use a single-line message"),
    changes: z
      .array(
        z.object({ path: editorPath, content: z.string().nullable() }).strict(),
      )
      .min(1)
      .max(MAX_EDITOR_CHANGES),
  })
  .strict();
const branchInput = z
  .object({
    source,
    repo: z.string().min(1).max(140),
    from: branchSchema,
    branch: branchSchema,
    expectedHead: headSchema,
  })
  .strict();
// Hosted repositories accept a narrower set of path characters.
const hostedPath = (path: string) => {
  if (!pathSchema.safeParse(path).success) throw invalid();
};

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid();
  return parsed.data;
}
function hostedEnabled() {
  if (!storageEnabled())
    throw new ApiError(
      503,
      "HOSTED_REPOSITORIES_UNAVAILABLE",
      "ProofStack-hosted repositories are not available yet. Use GitHub for now",
    );
}
// Drops a revoked GitHub connection so the editor offers to reconnect.
async function withGithub<T>(uid: string, fn: (token: string) => Promise<T>) {
  const { token } = await requireGithub(uid);
  try {
    return await fn(token);
  } catch (error) {
    if (error instanceof ApiError && error.code === "GITHUB_RECONNECT")
      await disconnectGithub(uid);
    throw error;
  }
}
const encode = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

type GithubRepo = {
  full_name: string;
  private: boolean;
  default_branch: string;
  permissions?: { push?: boolean };
  pushed_at: string | null;
};
export async function listRepositories(uid: string, raw: unknown) {
  const { source: src } = parse(z.object({ source }).strict(), raw);
  if (src === "github")
    return withGithub(uid, async (token) => ({
      repositories: (
        await githubRequest<GithubRepo[]>(
          token,
          "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member",
        )
      ).map((r) => ({
        id: r.full_name,
        name: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        canWrite: !!r.permissions?.push,
      })),
    }));
  hostedEnabled();
  const { rows } = await pool.query(
    `SELECT r.id,p.title AS name,r.default_branch AS "defaultBranch",
     p.visibility<>'public' AS private,coalesce(${repositoryWriteWhere("$1")},false) AS "canWrite"
     FROM repositories r JOIN community_projects p ON p.id=r.project_id
     JOIN users owner_u ON owner_u.id=p.owner_id AND owner_u.status='active'
     LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id
     WHERE ${projectReadWhere()} AND ${repositoryWriteWhere("$1")} ORDER BY p.title LIMIT 100`,
    [uid],
  );
  return { repositories: rows };
}

export async function listBranches(uid: string, raw: unknown) {
  const q = parse(location, raw);
  const repo = repoFor(q.source, q.repo);
  if (q.source === "github")
    return withGithub(uid, async (token) => ({
      branches: (
        await githubRequest<{ name: string; commit: { sha: string } }[]>(
          token,
          `/repos/${repo}/branches?per_page=100`,
        )
      ).map((b) => ({ name: b.name, head: b.commit.sha })),
    }));
  hostedEnabled();
  await repositoryAccess(repo, uid);
  const { rows } = await pool.query(
    "SELECT name,head FROM repository_branches WHERE repository_id=$1 ORDER BY name",
    [repo],
  );
  return { branches: rows };
}

type GithubTree = {
  sha: string;
  truncated: boolean;
  tree: { path: string; type: string; mode: string; size?: number }[];
};
async function githubHead(token: string, repo: string, branch: string) {
  const ref = await githubRequest<{
    commit: { sha: string; commit: { tree: { sha: string } } };
  }>(token, `/repos/${repo}/branches/${encode(branch)}`);
  return { head: ref.commit.sha, tree: ref.commit.commit.tree.sha };
}

export async function listTree(uid: string, raw: unknown) {
  const q = parse(branchQuery, raw);
  const repo = repoFor(q.source, q.repo);
  if (q.source === "github")
    return withGithub(uid, async (token) => {
      const { head, tree } = await githubHead(token, repo, q.branch);
      const data = await githubRequest<GithubTree>(
        token,
        `/repos/${repo}/git/trees/${tree}?recursive=1`,
      );
      // Regular files only; submodules and symlinks are not editable here.
      const files = data.tree
        .filter(
          (e) =>
            e.type === "blob" && (e.mode === "100644" || e.mode === "100755"),
        )
        .map((e) => ({ path: e.path, size: e.size ?? 0 }));
      return {
        head,
        files: files.slice(0, MAX_EDITOR_FILES),
        truncated: data.truncated || files.length > MAX_EDITOR_FILES,
      };
    });
  hostedEnabled();
  return lockedRepository(repo, uid, async (_repo, path, _db, branches) => {
    const branch = branches.find((b) => b.name === q.branch);
    if (!branch)
      throw new ApiError(404, "BRANCH_NOT_FOUND", "Branch not found");
    return { head: branch.head, ...(await listFiles(path, branch.head)) };
  });
}

export async function readFile(uid: string, raw: unknown) {
  const q = parse(fileQuery, raw);
  const repo = repoFor(q.source, q.repo);
  if (q.source === "github")
    return withGithub(uid, async (token) => {
      const data = await githubRequest<{
        type: string;
        size: number;
        content?: string;
        encoding?: string;
      }>(
        token,
        `/repos/${repo}/contents/${encode(q.path)}?ref=${encodeURIComponent(q.branch)}`,
      );
      if (data.type !== "file")
        throw new ApiError(400, "NOT_A_FILE", "This path is not a file");
      if (
        data.size > MAX_REPOSITORY_FILE_BYTES ||
        data.encoding !== "base64" ||
        data.content === undefined
      )
        return { path: q.path, content: "", size: data.size, editable: false };
      const bytes = Buffer.from(data.content, "base64");
      const binary = bytes.includes(0);
      return {
        path: q.path,
        content: binary ? "" : bytes.toString("utf8"),
        size: data.size,
        editable: !binary,
      };
    });
  hostedEnabled();
  hostedPath(q.path);
  return lockedRepository(repo, uid, async (_repo, path, _db, branches) => {
    const branch = branches.find((b) => b.name === q.branch);
    if (!branch)
      throw new ApiError(404, "BRANCH_NOT_FOUND", "Branch not found");
    const file = await readSource(path, branch.head, q.path);
    return {
      path: q.path,
      content: file.content,
      size: file.size,
      editable: file.previewable,
    };
  });
}

export async function commitChanges(
  req: Request,
  s: AuthSession,
  raw: unknown,
) {
  const d = parse(commitInput, raw);
  const repo = repoFor(d.source, d.repo);
  const bytes = d.changes.reduce(
    (n, c) => n + Buffer.byteLength(c.content ?? ""),
    0,
  );
  if (
    bytes > MAX_EDITOR_COMMIT_BYTES ||
    d.changes.some(
      (c) =>
        c.content !== null &&
        Buffer.byteLength(c.content) > MAX_REPOSITORY_FILE_BYTES,
    )
  )
    throw new ApiError(
      413,
      "COMMIT_TOO_LARGE",
      "Each file can be up to 1 MiB and a commit up to 5 MiB",
    );
  if (new Set(d.changes.map((c) => c.path)).size !== d.changes.length)
    throw invalid();
  if (d.source === "github")
    return withGithub(s.user.id, async (token) => {
      const { head, tree } = await githubHead(token, repo, d.branch);
      if (head !== d.expectedHead)
        throw new ApiError(
          409,
          "BRANCH_MOVED",
          "This branch changed since you opened it. Reload, review and commit again",
        );
      // Keep each existing file's mode (for example executable scripts).
      const base = await githubRequest<GithubTree>(
        token,
        `/repos/${repo}/git/trees/${tree}?recursive=1`,
      );
      const modes = new Map(base.tree.map((e) => [e.path, e.mode]));
      const next = await githubRequest<{ sha: string }>(
        token,
        `/repos/${repo}/git/trees`,
        {
          method: "POST",
          body: {
            base_tree: tree,
            tree: d.changes.map((c) =>
              c.content === null
                ? { path: c.path, mode: "100644", type: "blob", sha: null }
                : {
                    path: c.path,
                    mode: modes.get(c.path) === "100755" ? "100755" : "100644",
                    type: "blob",
                    content: c.content,
                  },
            ),
          },
        },
      );
      const commit = await githubRequest<{ sha: string }>(
        token,
        `/repos/${repo}/git/commits`,
        {
          method: "POST",
          body: { message: d.message, tree: next.sha, parents: [head] },
        },
      );
      if (d.newBranch)
        await githubRequest(token, `/repos/${repo}/git/refs`, {
          method: "POST",
          body: { ref: `refs/heads/${d.newBranch}`, sha: commit.sha },
        });
      else
        await githubRequest(
          token,
          `/repos/${repo}/git/refs/heads/${encode(d.branch)}`,
          { method: "PATCH", body: { sha: commit.sha, force: false } },
        );
      return {
        message: "Committed to GitHub",
        branch: d.newBranch ?? d.branch,
        head: commit.sha,
      };
    });
  hostedEnabled();
  for (const change of d.changes) hostedPath(change.path);
  // Hosted repositories protect the default branch, so commit onto a new
  // working branch when one is requested.
  let branch = d.branch;
  let expectedHead = d.expectedHead;
  if (d.newBranch) {
    await runRepositoryAction(req, s, {
      action: "branch",
      id: repo,
      from: d.branch,
      branch: d.newBranch,
      expectedHead: d.expectedHead,
    });
    branch = d.newBranch;
  }
  await runRepositoryAction(req, s, {
    action: "commit-files",
    id: repo,
    branch,
    expectedHead,
    message: d.message,
    changes: d.changes,
  });
  const head = (
    await pool.query(
      "SELECT head FROM repository_branches WHERE repository_id=$1 AND name=$2",
      [repo, branch],
    )
  ).rows[0]?.head as string;
  expectedHead = head;
  return { message: "Committed", branch, head: expectedHead };
}

export async function createBranch(req: Request, s: AuthSession, raw: unknown) {
  const d = parse(branchInput, raw);
  const repo = repoFor(d.source, d.repo);
  if (d.source === "github")
    return withGithub(s.user.id, async (token) => {
      const { head } = await githubHead(token, repo, d.from);
      if (head !== d.expectedHead)
        throw new ApiError(
          409,
          "BRANCH_MOVED",
          "This branch changed since you opened it. Reload and try again",
        );
      await githubRequest(token, `/repos/${repo}/git/refs`, {
        method: "POST",
        body: { ref: `refs/heads/${d.branch}`, sha: head },
      });
      return { message: "Branch created", branch: d.branch, head };
    });
  hostedEnabled();
  await runRepositoryAction(req, s, {
    action: "branch",
    id: repo,
    from: d.from,
    branch: d.branch,
    expectedHead: d.expectedHead,
  });
  return { message: "Branch created", branch: d.branch, head: d.expectedHead };
}
