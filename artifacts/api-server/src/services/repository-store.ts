import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "../lib/logger";
import {
  ObjectStorageService,
  isObjectNotFound,
  r2,
} from "../lib/objectStorage";
import { repoError, uuid } from "./repository-input";

// Hosting with a disk that is wiped on restart (Render Free) keeps every
// repository in R2 as one Git bundle: written before the database records a
// change, read back the first time the repository is opened after a restart.
// Branch and tag heads live in the database (syncRefs restores them), so the
// bundle only has to carry the objects. REPOSITORY_STORE=r2 switches it on.
export const repositoryStoreEnabled = () =>
  process.env.REPOSITORY_STORE === "r2";

type Git = (path: string, args: string[]) => Promise<Buffer>;

function location(id: string) {
  uuid.parse(id);
  const [, bucket, ...prefix] = new ObjectStorageService()
    .getPrivateObjectDir()
    .split("/");
  return { bucket, key: `${prefix.join("/")}/repositories/${id}.bundle` };
}

// The objects in a repository, cheaply: changes whenever objects are added.
const fingerprint = async (git: Git, path: string) =>
  (await git(path, ["count-objects", "-v"])).toString();
const saved = new Map<string, string>();
const scratch = () => join(tmpdir(), `proofstack-bundle-${randomUUID()}`);

// Saves the repository unless nothing changed since the last save. Throws on
// failure so the caller's transaction is rolled back.
export async function saveRepository(git: Git, id: string, path: string) {
  if (!repositoryStoreEnabled()) return;
  const current = await fingerprint(git, path);
  if (saved.get(id) === current) return;
  const refs = (await git(path, ["for-each-ref", "--count=1"])).toString();
  if (!refs.trim()) return; // Nothing to bundle yet.
  const file = scratch();
  try {
    await git(path, ["bundle", "create", file, "--all"]);
    const body = await readFile(file);
    const target = location(id);
    try {
      await r2.client().send(
        new PutObjectCommand({
          Bucket: target.bucket,
          Key: target.key,
          Body: body,
          ContentLength: body.length,
          ContentType: "application/octet-stream",
        }),
      );
    } catch {
      throw repoError("Repository could not be saved. Try again.", 503);
    }
    saved.set(id, current);
  } finally {
    await rm(file, { force: true });
  }
}

// Restores a repository folder from its saved bundle. Returns false when no
// bundle exists. Concurrent callers for one repository share one restore.
const restoring = new Map<string, Promise<boolean>>();
export function restoreRepository(
  git: Git,
  initialize: (path: string) => Promise<void>,
  id: string,
  path: string,
) {
  const pending = restoring.get(id);
  if (pending) return pending;
  const work = (async () => {
    let body: Buffer;
    try {
      const target = location(id);
      const result = await r2
        .client()
        .send(new GetObjectCommand({ Bucket: target.bucket, Key: target.key }));
      if (!result.Body) return false;
      body = Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      if (isObjectNotFound(error)) return false;
      logger.warn("Repository bundle could not be read");
      throw repoError("Repository storage is unavailable. Retry shortly.", 503);
    }
    const file = scratch();
    try {
      await writeFile(file, body, { mode: 0o600 });
      await mkdir(path, { mode: 0o700 });
      try {
        await initialize(path);
        await git(path, ["bundle", "unbundle", file]);
      } catch (error) {
        await rm(path, { recursive: true, force: true });
        throw error;
      }
      saved.set(id, await fingerprint(git, path));
      return true;
    } finally {
      await rm(file, { force: true });
    }
  })().finally(() => restoring.delete(id));
  restoring.set(id, work);
  return work;
}

// Deletes a repository's saved copy (after the repository is deleted).
export async function deleteRepositoryBundle(id: string) {
  if (!repositoryStoreEnabled()) return;
  const target = location(id);
  try {
    await r2
      .client()
      .send(
        new DeleteObjectCommand({ Bucket: target.bucket, Key: target.key }),
      );
  } catch (error) {
    if (!isObjectNotFound(error))
      throw repoError(
        "Repository storage could not be cleared. Try again.",
        503,
      );
  }
  saved.delete(id);
}
