import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { ObjectStorageService, r2 } from "../lib/objectStorage";
import { repoError } from "./repository-input";

// Published demos: the static files of one branch, copied to R2 under
// <PRIVATE_OBJECT_DIR prefix>/demos/<handle>/<name>/ and served by the
// separate demo site (artifacts/demos) at DEMO_ORIGIN/<handle>/<name>/.
// Only public projects publish; the demo site is public by nature.
export const MAX_DEMO_FILES = 500;
export const MAX_DEMO_BYTES = 25 * 1024 * 1024;
// Where a site's index.html may live, in order of preference.
export const DEMO_FOLDERS = ["", "dist", "build", "public", "docs", "site"];

export function demoOrigin() {
  const origin = process.env.DEMO_ORIGIN?.trim() ?? "";
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.origin === origin ? origin : null;
  } catch {
    return null;
  }
}
export const demoUrl = (origin: string, handle: string, name: string) =>
  `${origin}/${handle.toLowerCase()}/${name.toLowerCase()}/`;

function demoPrefix(handle: string, name: string) {
  const [, bucket, ...prefix] = new ObjectStorageService()
    .getPrivateObjectDir()
    .split("/");
  return {
    bucket,
    prefix: `${prefix.join("/")}/demos/${handle.toLowerCase()}/${name.toLowerCase()}/`,
  };
}

const TYPES: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const typeOf = (path: string) =>
  TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ??
  "application/octet-stream";

export type DemoFile = { path: string; size: number; oid: string };

// Chooses the folder that holds the site and the files to publish from it.
export function demoFiles(files: DemoFile[]) {
  const folder = DEMO_FOLDERS.find((f) =>
    files.some((file) => file.path === (f ? `${f}/index.html` : "index.html")),
  );
  if (folder === undefined)
    throw repoError(
      "Add an index.html at the top of the repository (or in dist, build, public, docs or site) to publish a demo.",
      400,
    );
  const base = folder ? `${folder}/` : "";
  const chosen = files
    .filter((f) => f.path.startsWith(base))
    .map((f) => ({ ...f, key: f.path.slice(base.length) }));
  if (chosen.length > MAX_DEMO_FILES)
    throw repoError(
      `A demo can have at most ${MAX_DEMO_FILES} files; this one has ${chosen.length}.`,
      413,
    );
  const total = chosen.reduce((n, f) => n + f.size, 0);
  if (total > MAX_DEMO_BYTES)
    throw repoError("A demo can be at most 25 MB in total.", 413);
  return { folder, files: chosen };
}

async function removeAll(bucket: string, prefix: string) {
  let token: string | undefined;
  do {
    const listed = await r2.client().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length)
      await r2.client().send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys, Quiet: true },
        }),
      );
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}

// Replaces the demo with the given files (read with readBlob).
export async function publishDemo(
  handle: string,
  name: string,
  files: (DemoFile & { key: string })[],
  readBlob: (oid: string) => Promise<Buffer>,
) {
  const { bucket, prefix } = demoPrefix(handle, name);
  try {
    await removeAll(bucket, prefix);
    for (let i = 0; i < files.length; i += 6)
      await Promise.all(
        files.slice(i, i + 6).map(async (file) => {
          const body = await readBlob(file.oid);
          await r2.client().send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: prefix + file.key,
              Body: body,
              ContentLength: body.length,
              ContentType: typeOf(file.key),
            }),
          );
        }),
      );
  } catch (error) {
    if (error && typeof error === "object" && "status" in error) throw error;
    throw repoError("The demo could not be published. Try again.", 503);
  }
}

export async function unpublishDemo(handle: string, name: string) {
  const { bucket, prefix } = demoPrefix(handle, name);
  try {
    await removeAll(bucket, prefix);
  } catch {
    throw repoError("The demo could not be removed. Try again.", 503);
  }
}
