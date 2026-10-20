// This module intentionally imports neither the database nor storage. Startup
// validation must succeed before the standalone entrypoint loads either client.

// A numeric object generation or an R2/S3 ETag (single or multipart).
export const STORAGE_VERSION =
  /^(?:[1-9][0-9]{0,29}|[0-9a-f]{32}(?:-[1-9][0-9]{0,4})?)$/;

export function assertAssetCleanupConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const namespaces = (env.ASSET_CLEANUP_ALLOWED_NAMESPACES || "")
    .split(",")
    .map((value) => value.trim());
  let databaseValid = false;
  try {
    const url = new URL(env.DATABASE_URL || "");
    databaseValid =
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      !!url.hostname &&
      url.pathname.length > 1;
  } catch {
    /* Invalid/missing URLs fail closed without logging their contents. */
  }
  let storageValid = false;
  try {
    const url = new URL(env.R2_ENDPOINT || "");
    storageValid =
      url.protocol === "https:" &&
      url.origin === env.R2_ENDPOINT &&
      !!env.R2_ACCESS_KEY_ID &&
      !!env.R2_SECRET_ACCESS_KEY;
  } catch {
    /* Same fail-closed rule as the database URL. */
  }
  if (
    env.ASSET_CLEANUP_ENABLED !== "true" ||
    !databaseValid ||
    !storageValid ||
    namespaces.some(
      (value) =>
        !/^\/[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(
          value,
        ) || value.split("/").some((part) => part === "." || part === ".."),
    )
  )
    throw new Error("ASSET_CLEANUP_CONFIGURATION_REQUIRED");
}

export class AssetCleanupDeadlineError extends Error {
  constructor() {
    super("ASSET_CLEANUP_DEADLINE_EXCEEDED");
  }
}

async function deadline<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AssetCleanupDeadlineError()),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function idle(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, 2000);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export async function superviseAssetCleanup(
  dependencies: {
    runOnce(): Promise<boolean>;
    close(): Promise<void>;
    warn(message: string): void;
  },
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      // The CLI MUST terminate on this deadline: Promise.race cannot cancel a
      // pending SDK/SQL request. Never keep processing after a timed-out job.
      // 120s is below the durable 5-minute lease; reclaim handles crash recovery.
      if (await deadline(dependencies.runOnce(), 120000)) continue;
    } catch (error) {
      if (error instanceof AssetCleanupDeadlineError) throw error;
      dependencies.warn("Asset cleanup iteration failed");
    }
    await idle(signal);
  }
  await deadline(dependencies.close(), 10000);
}
