// Browser client for /api/editor. The server holds any GitHub token; the
// browser only ever talks to ProofStack.
export type Source = "github" | "hosted";
export type EditorSources = {
  github: { available: boolean; connected: boolean; login: string | null };
  hosted: { available: boolean };
};
export type EditorRepository = {
  id: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  canWrite: boolean;
};
export type EditorBranch = { name: string; head: string };
export type EditorTree = {
  head: string;
  files: { path: string; size: number }[];
  truncated: boolean;
};
export type EditorFile = {
  path: string;
  content: string;
  size: number;
  editable: boolean;
};
export type EditorChange = { path: string; content: string | null };
export type CommitResult = { message: string; branch: string; head: string };

export class EditorError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/editor${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new EditorError(
      payload?.error?.message ?? `Request failed (${response.status})`,
      payload?.error?.code,
      response.status,
    );
  return payload as T;
}
const query = (values: Record<string, string>) =>
  "?" + new URLSearchParams(values).toString();
const post = <T>(path: string, csrf: string, body: unknown = {}) =>
  request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify(body),
  });

export const editorApi = {
  sources: () => request<EditorSources>("/sources"),
  repositories: (source: Source) =>
    request<{ repositories: EditorRepository[] }>(
      "/repositories" + query({ source }),
    ),
  branches: (source: Source, repo: string) =>
    request<{ branches: EditorBranch[] }>(
      "/branches" + query({ source, repo }),
    ),
  tree: (source: Source, repo: string, branch: string) =>
    request<EditorTree>("/tree" + query({ source, repo, branch })),
  file: (source: Source, repo: string, branch: string, path: string) =>
    request<EditorFile>("/file" + query({ source, repo, branch, path })),
  commit: (
    csrf: string,
    body: {
      source: Source;
      repo: string;
      branch: string;
      expectedHead: string;
      newBranch?: string;
      message: string;
      changes: EditorChange[];
    },
  ) => post<CommitResult>("/commit", csrf, body),
  branch: (
    csrf: string,
    body: {
      source: Source;
      repo: string;
      from: string;
      branch: string;
      expectedHead: string;
    },
  ) => post<CommitResult>("/branch", csrf, body),
  // returnTo: where GitHub sends the member back (the editor or the wizard).
  connectGithub: (
    csrf: string,
    returnTo: "code" | "welcome" | "settings" = "code",
  ) => post<{ authorizeUrl: string }>("/github/connect", csrf, { returnTo }),
  disconnectGithub: (csrf: string) =>
    post<{ message: string }>("/github/disconnect", csrf),
};

// Folders and files for the explorer, built from flat file paths.
export type TreeNode = {
  name: string;
  path: string;
  kind: "folder" | "file";
  children: TreeNode[];
};
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", kind: "folder", children: [] };
  for (const path of paths) {
    let node = root;
    const parts = path.split("/");
    parts.forEach((name, index) => {
      const file = index === parts.length - 1;
      const childPath = parts.slice(0, index + 1).join("/");
      let child = node.children.find(
        (c) => c.name === name && c.kind === (file ? "file" : "folder"),
      );
      if (!child) {
        child = {
          name,
          path: childPath,
          kind: file ? "file" : "folder",
          children: [],
        };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort(
        (a, b) =>
          (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1) ||
          a.name.localeCompare(b.name),
      )
      .map((n) => ({ ...n, children: sort(n.children) }));
  return sort(root.children);
}

// The same rules the server applies, checked before a request is sent.
export function pathProblem(path: string) {
  if (!path) return "Enter a file path.";
  if (path.length > 1024) return "That path is too long.";
  if (
    Array.from(path).some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === "\\",
    ) ||
    path.split("/").some((p) => !p || p === "." || p === "..")
  )
    return "Use a relative path like src/app.ts.";
  return null;
}
export function branchProblem(name: string) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/.test(name) ||
    name.includes("..") ||
    name.includes("//") ||
    name.endsWith("/") ||
    name.endsWith(".") ||
    name.split("/").some((p) => p.startsWith(".") || p.endsWith(".lock"))
  )
    return "Use letters, numbers, dots, dashes and slashes, like feature/login.";
  return null;
}
