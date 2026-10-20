import { ApiError } from "../lib/errors";
import { spawn } from "node:child_process";
import { mkdir, lstat, realpath, readdir, unlink } from "node:fs/promises";
import { resolve, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  repoError,
  uuid,
  branchSchema,
  headSchema,
  pathSchema,
  MAX_REPOSITORY_FILE_BYTES,
  MAX_REPOSITORY_PUSH_FILE_BYTES,
} from "./repository-input";
export class GitCommandError extends ApiError {
  constructor(
    readonly exitCode: number,
    readonly output: Buffer,
  ) {
    super(
      409,
      "REPOSITORY_GIT_FAILED",
      "Git could not complete this operation.",
    );
  }
}
const MAX_OUTPUT = 8 * 1024 * 1024;
let running = 0;
export function storageEnabled() {
  return !!process.env.REPOSITORY_ROOT;
}
export async function repoPath(id: string, create = false) {
  uuid.parse(id);
  const configured = process.env.REPOSITORY_ROOT;
  if (!configured || !isAbsolute(configured))
    throw repoError(
      "Repository storage is not configured on this server.",
      503,
    );
  const root = resolve(configured);
  if (root === "/" || root === process.cwd())
    throw repoError(
      "Repository storage must use a dedicated private directory.",
      503,
    );
  await mkdir(root, { recursive: true, mode: 0o700 });
  const canonical = await realpath(root);
  const path = join(canonical, id + ".git");
  if (create) await mkdir(path, { mode: 0o700 });
  const st = await lstat(path).catch(() => null);
  if (!st?.isDirectory() || st.isSymbolicLink())
    throw repoError(
      "Repository storage is unavailable. Contact the operator.",
      503,
    );
  return path;
}
/** Git never receives a shell, remote URL, user environment, executable hook or worktree. */
export async function git(
  path: string,
  args: string[],
  input: Buffer | string = "",
  extra: Record<string, string> = {},
  maxOutput = MAX_OUTPUT,
): Promise<Buffer> {
  if (running >= 4)
    throw repoError("Repository service is busy. Retry shortly.", 503);
  running++;
  try {
    return await new Promise<Buffer>((resolvePromise, reject) => {
      let complete = false,
        bytes = 0;
      const output: Buffer[] = [];
      const child = spawn(
        "git",
        [
          "--git-dir=" + path,
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "core.attributesFile=/dev/null",
          "-c",
          "protocol.allow=never",
          "-c",
          "gc.auto=0",
          "-c",
          "core.fsync=loose-object,reference",
          "-c",
          "core.fsyncMethod=fsync",
          ...args,
        ],
        {
          detached: process.platform !== "win32",
          env: {
            PATH: process.env.PATH ?? "/usr/bin:/bin",
            HOME: path,
            LANG: "C.UTF-8",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_TERMINAL_PROMPT: "0",
            GIT_NO_REPLACE_OBJECTS: "1",
            GIT_LITERAL_PATHSPECS: "1",
            GIT_ALLOW_PROTOCOL: "",
            ...extra,
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const finish = (error?: Error) => {
        if (complete) return;
        complete = true;
        clearTimeout(timer);
        if (error) {
          try {
            if (process.platform !== "win32" && child.pid)
              process.kill(-child.pid, "SIGKILL");
            else child.kill("SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
          reject(error);
        } else resolvePromise(Buffer.concat(output));
      };
      const timer = setTimeout(
        () => finish(repoError("Repository operation timed out.", 503)),
        15000,
      );
      child.on("error", () =>
        finish(repoError("Git is unavailable on this server.", 503)),
      );
      child.stdout.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxOutput)
          finish(repoError("Repository response exceeds the size limit.", 413));
        else output.push(chunk);
      });
      // Drain stderr without exposing filesystem paths or keeping unbounded output.
      child.stderr.on("data", () => {});
      child.stdin.on("error", () => {});
      child.on("close", (code) =>
        finish(
          code === 0
            ? undefined
            : new GitCommandError(code ?? -1, Buffer.concat(output)),
        ),
      );
      child.stdin.end(input);
    });
  } finally {
    running--;
  }
}
export async function storageBytes(path: string): Promise<number> {
  let total = 0;
  for (const item of await readdir(path, { withFileTypes: true })) {
    const p = join(path, item.name);
    if (item.isSymbolicLink())
      throw repoError("Unsafe repository storage detected.", 503);
    if (item.isDirectory()) total += await storageBytes(p);
    else total += (await lstat(p)).size;
  }
  return total;
}
export async function quota(path: string, limit: number) {
  if ((await storageBytes(path)) > limit)
    throw repoError(
      "Repository storage quota reached. Contact the operator before retrying.",
      413,
    );
}
export async function validatePushedTree(path: string, head: string) {
  headSchema.parse(head);
  const entries = (
    await git(path, ["ls-tree", "-r", "-z", "--full-tree", head])
  )
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  if (entries.length > 10000)
    throw repoError("A repository tree may contain at most 10,000 files.", 413);
  for (const entry of entries) {
    const tab = entry.indexOf("\t");
    const [mode, type, oid] = entry.slice(0, tab).split(" ");
    const file = entry.slice(tab + 1);
    if (
      !["100644", "100755"].includes(mode) ||
      type !== "blob" ||
      !pathSchema.safeParse(file).success
    )
      throw repoError("Only safe regular files may be pushed.", 400);
    const size = Number((await git(path, ["cat-file", "-s", oid])).toString());
    if (!Number.isSafeInteger(size) || size > MAX_REPOSITORY_PUSH_FILE_BYTES)
      throw repoError("A pushed file exceeds the 10 MiB file limit.", 413);
  }
}
export async function initialize(path: string) {
  await git(path, ["init", "--bare", "--initial-branch=main", path]);
  await git(path, ["config", "uploadpack.allowReachableSHA1InWant", "false"]);
  await git(path, ["config", "uploadpack.allowAnySHA1InWant", "false"]);
  await git(path, ["config", "uploadpack.allowTipSHA1InWant", "false"]);
}
export async function commitFile(
  path: string,
  base: string | null,
  file: string,
  content: string,
  message: string,
  author: { id: string; name: string },
  remove = false,
) {
  pathSchema.refine((v) => v.length > 0).parse(file);
  if (base) headSchema.parse(base);
  const index = join(path, "proofstack-index-" + randomUUID());
  const env = { GIT_INDEX_FILE: index };
  try {
    await git(path, ["read-tree", base ?? "--empty"], "", env);
    if (remove)
      await git(
        path,
        ["update-index", "-z", "--index-info"],
        `0 ${"0".repeat(40)}\t${file}\0`,
        env,
      );
    else {
      const blob = (await git(path, ["hash-object", "-w", "--stdin"], content))
        .toString()
        .trim();
      await git(
        path,
        ["update-index", "--add", "--cacheinfo", `100644,${blob},${file}`],
        "",
        env,
      );
    }
    const tree = (await git(path, ["write-tree"], "", env)).toString().trim();
    if (base) {
      const old = (await git(path, ["rev-parse", base + "^{tree}"]))
        .toString()
        .trim();
      if (tree === old) throw repoError("No changes to commit.", 409);
    }
    const name =
      Array.from(author.name)
        .filter(
          (c) =>
            c.charCodeAt(0) >= 32 &&
            c.charCodeAt(0) !== 127 &&
            c !== "<" &&
            c !== ">",
        )
        .join("")
        .slice(0, 100) || "ProofStack member";
    return (
      await git(
        path,
        ["commit-tree", tree, ...(base ? ["-p", base] : []), "-m", message],
        "",
        {
          ...env,
          GIT_AUTHOR_NAME: name,
          GIT_AUTHOR_EMAIL: author.id + "@users.proofstack.invalid",
          GIT_COMMITTER_NAME: "ProofStack",
          GIT_COMMITTER_EMAIL: "noreply@proofstack.invalid",
        },
      )
    )
      .toString()
      .trim();
  } finally {
    await unlink(index).catch(() => {});
    await unlink(index + ".lock").catch(() => {});
  }
}
export async function syncRefs(
  path: string,
  branches: { name: string; head: string }[],
  tags: { name: string; head: string }[] = [],
) {
  for (const b of [...branches, ...tags]) {
    branchSchema.parse(b.name);
    headSchema.parse(b.head);
  }
  const existing = (await git(path, ["for-each-ref", "--format=%(refname)"]))
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  const names = new Set([
    ...branches.map((b) => "refs/heads/" + b.name),
    ...tags.map((t) => "refs/tags/" + t.name),
  ]);
  const commands =
    [
      "start",
      ...existing
        .filter((ref) => !names.has(ref))
        .map((ref) => "delete " + ref),
      ...branches.map((b) => `update refs/heads/${b.name} ${b.head}`),
      ...tags.map((t) => `update refs/tags/${t.name} ${t.head}`),
      "prepare",
      "commit",
    ].join("\n") + "\n";
  await git(path, ["update-ref", "--stdin"], commands);
  await git(path, ["symbolic-ref", "HEAD", "refs/heads/main"]);
}
export type GitEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  oid: string;
};
export async function treeEntries(path: string, head: string, folder: string) {
  headSchema.parse(head);
  pathSchema.parse(folder);
  const raw = await git(path, [
    "ls-tree",
    "-z",
    folder ? `${head}:${folder}` : head,
  ]);
  const entries = raw
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      const [mode, type, oid] = line.slice(0, tab).split(" ");
      const name = line.slice(tab + 1);
      if (type !== "tree" && mode !== "100644")
        throw repoError("Unsupported repository object.", 409);
      return {
        name,
        path: folder ? folder + "/" + name : name,
        kind: type === "tree" ? ("directory" as const) : ("file" as const),
        oid,
      };
    });
  if (entries.length > 1000)
    throw repoError("Directory exceeds the browser entry limit.", 413);
  return entries.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );
}
export async function readSource(path: string, head: string, file: string) {
  pathSchema.refine((v) => v.length > 0).parse(file);
  headSchema.parse(head);
  const raw = (await git(path, ["ls-tree", "-z", head, "--", file]))
    .toString()
    .split("\0")[0];
  if (!raw || raw.slice(raw.indexOf("\t") + 1) !== file)
    throw repoError("File not found.", 404);
  const [mode, type, oid] = raw.slice(0, raw.indexOf("\t")).split(" ");
  if (mode !== "100644" || type !== "blob")
    throw repoError("This path is not a text file.", 400);
  const size = Number((await git(path, ["cat-file", "-s", oid])).toString());
  if (size > MAX_REPOSITORY_FILE_BYTES)
    return { content: "", size, previewable: false };
  const bytes = await git(path, ["cat-file", "blob", oid]);
  const content = bytes.toString("utf8");
  return {
    content: content.includes("\0") ? "" : content,
    size,
    previewable: !content.includes("\0"),
  };
}
export async function history(path: string, head: string, offset: number) {
  const raw = await git(path, [
    "log",
    head,
    "--max-count=21",
    "--skip=" + offset,
    "--format=%H%x00%an%x00%aI%x00%s%x1e",
  ]);
  const rows = raw
    .toString()
    .split("\x1e")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [sha, author, date, message] = s.split("\0");
      return { sha, author, date, message };
    });
  return { commits: rows.slice(0, 20), hasMore: rows.length > 20 };
}
