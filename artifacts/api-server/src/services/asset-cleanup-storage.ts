import { ObjectStorageService, type StoredObject } from "../lib/objectStorage";
import { STORAGE_VERSION } from "./asset-cleanup-runtime";
import type { CleanupStorage, CleanupTarget } from "./asset-cleanup-worker";

const storage = new ObjectStorageService();

function capturedObject(target: CleanupTarget): StoredObject {
  if (
    !/^[a-z0-9][a-z0-9._-]*$/.test(target.bucket) ||
    !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(target.namespace) ||
    target.namespace.split("/").some((p) => p === "." || p === "..") ||
    !/^\/objects\/(ready|uploads)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      target.object_path,
    ) ||
    target.object_name !== `${target.namespace}/${target.object_path.slice(9)}`
  )
    throw new Error("Invalid cleanup target");
  const allowed = (process.env.ASSET_CLEANUP_ALLOWED_NAMESPACES || "")
    .split(",")
    .map((s) => s.trim());
  if (!allowed.includes(`/${target.bucket}/${target.namespace}`))
    throw new Error("Cleanup namespace not allowlisted");
  // The captured key, never one derived from the current PRIVATE_OBJECT_DIR.
  return { bucket: target.bucket, key: target.object_name };
}
export const cleanupStorage: CleanupStorage = {
  async inspect(target) {
    const version = await storage.inspect(capturedObject(target));
    if (version !== null && !STORAGE_VERSION.test(version))
      throw new Error("Storage version required");
    return version;
  },
  async remove(target, version) {
    if (typeof version !== "string" || !STORAGE_VERSION.test(version))
      throw new Error("Invalid cleanup version");
    // Keys are immutable: each upload reserves a fresh UUID key that is written
    // once, after the asset row is locked, and never reused. The pinned version
    // is compared before this call; R2 delete preconditions are not relied on.
    // The supervisor's 120s deadline bounds this call below the 5-minute lease.
    await storage.remove(capturedObject(target));
  },
};
