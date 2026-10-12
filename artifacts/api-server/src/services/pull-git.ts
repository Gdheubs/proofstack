import { git, GitCommandError } from "./repository-git";
import { headSchema, repoError } from "./repository-input";
import { ApiError } from "../lib/errors";
export async function patchCheck(path: string, target: string, source: string) {
  try {
    await git(
      path,
      ["diff", "--check", `${target}...${source}`],
      "",
      {},
      65536,
    );
    return {
      status: "passed" as const,
      details:
        "Git patch whitespace check passed. This does not run application tests, build steps, or security scanning.",
    };
  } catch (e) {
    if (e instanceof GitCommandError && e.exitCode === 2)
      return {
        status: "failed" as const,
        details:
          e.output.toString("utf8").slice(0, 8000) ||
          "The patch contains whitespace errors.",
      };
    if (e instanceof ApiError && e.status === 413)
      return {
        status: "failed" as const,
        details:
          "The check output exceeded its limit. Review the patch locally.",
      };
    throw e;
  }
}
export async function pullDiff(path: string, target: string, source: string) {
  let patch = "",
    truncated = false;
  try {
    patch = (
      await git(
        path,
        [
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--no-renames",
          "--unified=3",
          `${target}...${source}`,
        ],
        "",
        {},
        262144,
      )
    ).toString("utf8");
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 413)) throw e;
    truncated = true;
  }
  const raw = (
    await git(path, [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      "--name-status",
      "-z",
      `${target}...${source}`,
    ])
  )
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const files = [];
  for (let i = 0; i < raw.length && files.length < 200; i += 2)
    files.push({ status: raw[i], path: raw[i + 1] });
  return { patch, patchTruncated: truncated || raw.length > 400, files };
}
export async function mergeCommit(
  path: string,
  target: string,
  source: string,
  message: string,
  uid: string,
) {
  let tree: string;
  try {
    tree = (await git(path, ["merge-tree", "--write-tree", target, source]))
      .toString()
      .split("\n")[0];
  } catch (e) {
    if (e instanceof GitCommandError && e.exitCode === 1)
      throw repoError(
        "Merge conflicts require resolution on the source branch before merging.",
        409,
      );
    throw e;
  }
  headSchema.parse(tree);
  return (
    await git(
      path,
      ["commit-tree", tree, "-p", target, "-p", source, "-m", message],
      "",
      {
        GIT_AUTHOR_NAME: "ProofStack merge",
        GIT_AUTHOR_EMAIL: uid + "@users.proofstack.invalid",
        GIT_COMMITTER_NAME: "ProofStack",
        GIT_COMMITTER_EMAIL: "noreply@proofstack.invalid",
      },
    )
  )
    .toString()
    .trim();
}
