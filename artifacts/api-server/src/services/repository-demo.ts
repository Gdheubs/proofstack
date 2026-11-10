import { randomUUID } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { ObjectStorageService, r2 } from "../lib/objectStorage";
import { repoError } from "./repository-input";

// Published demos: the static files of one branch, copied to R2 and served by
// the separate demo site (artifacts/demos) at DEMO_ORIGIN/<handle>/<name>/.
// Layout under <PRIVATE_OBJECT_DIR prefix>/demos/<handle>/<name>/:
//   current            the live version id (text)
//   v/<version>/<path> one complete copy per published version
// A publish uploads a whole new version, then switches "current", so a
// failure never leaves a half-published demo. Only public projects publish.
export const MAX_DEMO_FILES = 500;
export const MAX_DEMO_BYTES = 25 * 1024 * 1024;
// Demos one member may have published at once.
export const MAX_PUBLISHED_DEMOS = 10;
// Where a site's index.html may live, in order of preference.
export const DEMO_FOLDERS = ["", "dist", "build", "public", "docs", "site"];
// Downloadable programs and archives are never served from a demo.
export const BLOCKED_DEMO_FILE =
  /\.(exe|msi|msix|dll|com|scr|bat|cmd|ps1|vbs|jar|apk|aab|ipa|dmg|pkg|deb|rpm|appimage|iso|img|zip|rar|7z|tar|gz|tgz|bz2|xz|cab)$/i;

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
  const blocked = chosen.find((f) => BLOCKED_DEMO_FILE.test(f.key));
  if (blocked)
    throw repoError(
      `Demos cannot include programs or archives (${blocked.key}). Remove it from the published folder.`,
      400,
    );
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

async function listKeys(bucket: string, prefix: string) {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const listed = await r2.client().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of listed.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
async function deleteKeys(bucket: string, keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000)
    await r2.client().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
}
const put = (bucket: string, key: string, body: Buffer, type: string) =>
  r2.client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: type,
    }),
  );

// Publishes a complete new version, then makes it current and removes the
// older ones. On failure the previous version stays live.
export async function publishDemo(
  handle: string,
  name: string,
  files: (DemoFile & { key: string })[],
  readBlob: (oid: string) => Promise<Buffer>,
) {
  const { bucket, prefix } = demoPrefix(handle, name);
  const version = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const base = `${prefix}v/${version}/`;
  try {
    for (let i = 0; i < files.length; i += 6)
      await Promise.all(
        files
          .slice(i, i + 6)
          .map(async (file) =>
            put(
              bucket,
              base + file.key,
              await readBlob(file.oid),
              typeOf(file.key),
            ),
          ),
      );
    await put(bucket, `${prefix}current`, Buffer.from(version), "text/plain");
  } catch (error) {
    await deleteKeys(bucket, await listKeys(bucket, base)).catch(() => {});
    if (error && typeof error === "object" && "status" in error) throw error;
    throw repoError("The demo could not be published. Try again.", 503);
  }
  // Older versions are no longer reachable; their removal may lag safely.
  const stale = (await listKeys(bucket, `${prefix}v/`).catch(() => [])).filter(
    (key) => !key.startsWith(base),
  );
  await deleteKeys(bucket, stale).catch(() => {});
}

// Removes a demo completely: the pointer first, so it stops being served.
export async function unpublishDemo(handle: string, name: string) {
  const { bucket, prefix } = demoPrefix(handle, name);
  try {
    await deleteKeys(bucket, [`${prefix}current`]);
    await deleteKeys(bucket, await listKeys(bucket, prefix));
  } catch {
    throw repoError("The demo could not be removed. Try again.", 503);
  }
}

// After a username change: copies the demo to the new address, then removes
// the old copy. Nothing happens when no demo was published.
export async function moveDemo(from: string, to: string, name: string) {
  const source = demoPrefix(from, name);
  const target = demoPrefix(to, name);
  try {
    const keys = await listKeys(source.bucket, source.prefix);
    if (!keys.length) return false;
    // Files first, pointer last, so the new address is complete when live.
    const ordered = [
      ...keys.filter(
        (k) => !k.endsWith("/current") && k !== `${source.prefix}current`,
      ),
      ...keys.filter((k) => k === `${source.prefix}current`),
    ];
    for (const key of ordered)
      await r2.client().send(
        new CopyObjectCommand({
          Bucket: target.bucket,
          Key: target.prefix + key.slice(source.prefix.length),
          CopySource: `${source.bucket}/${encodeURI(key)}`,
        }),
      );
    await deleteKeys(source.bucket, keys);
    return true;
  } catch {
    throw repoError(
      "Your demos could not be moved to the new username. Try again.",
      503,
    );
  }
}
