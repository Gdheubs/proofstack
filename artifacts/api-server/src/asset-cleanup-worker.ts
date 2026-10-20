import {
  assertAssetCleanupConfiguration,
  drainAssetCleanup,
  superviseAssetCleanup,
} from "./services/asset-cleanup-runtime";

async function main() {
  // Default off. In particular, do not import @workspace/db (which constructs a
  // pool) or the storage SDK before validating explicit operator configuration.
  assertAssetCleanupConfiguration();
  const stopping = new AbortController();
  const stop = () => stopping.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const [{ pool }, { cleanupStorage }, { runAssetCleanupOnce }] =
    await Promise.all([
      import("@workspace/db"),
      import("./services/asset-cleanup-storage"),
      import("./services/asset-cleanup-worker"),
    ]);
  const dependencies = {
    runOnce: () => runAssetCleanupOnce(cleanupStorage),
    close: () => pool.end(),
    warn: (message: string) => console.warn(message),
  };
  // --once drains due jobs and exits, for schedulers without an always-on worker.
  if (process.argv.includes("--once")) {
    const { processed } = await drainAssetCleanup(
      dependencies,
      stopping.signal,
    );
    console.info(`Asset cleanup run finished: ${processed} job(s) processed`);
  } else {
    console.info("Asset cleanup worker started");
    await superviseAssetCleanup(dependencies, stopping.signal);
    console.info("Asset cleanup worker stopped");
  }
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}

main().catch(() => {
  // Never log provider exceptions, object names, signed URLs or DB credentials.
  // Hard exit also fences a timed-out SDK operation: it cannot continue deleting
  // after our lease expires. A process manager may restart this dedicated worker.
  console.error(
    "Asset cleanup worker stopped: configuration or runtime failure",
  );
  process.exit(1);
});
