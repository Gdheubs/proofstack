import { objectStorageClient } from "../lib/objectStorage";
import type { CleanupStorage, CleanupTarget } from "./asset-cleanup-worker";

function capturedFile(target: CleanupTarget) {
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
  return objectStorageClient.bucket(target.bucket).file(target.object_name);
}
export const cleanupStorage: CleanupStorage = {
  async inspect(target) {
    const file = capturedFile(target);
    try {
      const [metadata] = await file.getMetadata({ timeout: 30000 });
      if (
        typeof metadata.generation !== "string" ||
        !/^[1-9][0-9]{0,29}$/.test(metadata.generation)
      )
        throw new Error("Storage generation required");
      return metadata.generation;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 404
      )
        return null;
      throw error;
    }
  },
  async remove(target, generation) {
    if (
      typeof generation !== "string" ||
      !/^[1-9][0-9]{0,29}$/.test(generation)
    )
      throw new Error("Invalid cleanup generation");
    // File.delete has no typed timeout option. The dedicated process supervisor
    // enforces a hard 120s iteration deadline, below the durable lease duration.
    await capturedFile(target).delete({
      ifGenerationMatch: generation,
      ignoreNotFound: true,
    });
  },
};
