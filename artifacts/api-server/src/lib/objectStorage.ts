import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export class StorageConfigurationError extends Error {}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Exact provider key of one immutable object. Authorization lives in SQL; the
// bucket stays private and every read goes through the API.
export type StoredObject = { bucket: string; key: string };

const OBJECT_PATH =
  /^\/objects\/(ready|uploads)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function validObjectNamespace(dir: string) {
  return (
    /^\/[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(
      dir,
    ) && !dir.split("/").some((part) => part === "." || part === "..")
  );
}

// Cloudflare R2 through its S3-compatible API. The credentials are server-only
// and the client is created lazily so processes without storage still start.
export function r2Settings(env: NodeJS.ProcessEnv = process.env) {
  const endpoint = env.R2_ENDPOINT ?? "";
  let https = false;
  try {
    const url = new URL(endpoint);
    https = url.protocol === "https:" && url.origin === endpoint;
  } catch {
    /* Invalid endpoints fail closed without echoing their value. */
  }
  if (!https || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)
    throw new StorageConfigurationError(
      "R2_ENDPOINT (exact HTTPS origin), R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required for image storage.",
    );
  return {
    endpoint,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

let client: S3Client | undefined;
export const r2 = {
  client(): S3Client {
    if (!client) {
      const settings = r2Settings();
      client = new S3Client({
        region: "auto",
        endpoint: settings.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: settings.accessKeyId,
          secretAccessKey: settings.secretAccessKey,
        },
        maxAttempts: 3,
        requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
        // R2 does not implement every optional SDK integrity extension.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
    }
    return client;
  },
};

export function isObjectNotFound(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "$metadata" in error &&
    (error.$metadata as { httpStatusCode?: number } | undefined)
      ?.httpStatusCode === 404
  );
}

export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new StorageConfigurationError(
        "PRIVATE_OBJECT_DIR not set. Set it to the private R2 /bucket/prefix namespace.",
      );
    }
    // Writes and /objects lookups share one canonical, non-root namespace.
    // Reject ambiguous keys instead of silently changing an existing object's name.
    if (!validObjectNamespace(dir)) {
      throw new StorageConfigurationError(
        "PRIVATE_OBJECT_DIR must be a canonical /bucket/nonempty-prefix path without trailing slashes or dot segments.",
      );
    }
    return dir;
  }

  assertConfigured() {
    this.getPrivateObjectDir();
    r2Settings();
  }

  locate(objectPath: string): StoredObject {
    if (!OBJECT_PATH.test(objectPath)) throw new ObjectNotFoundError();
    const [, bucket, ...prefix] = this.getPrivateObjectDir().split("/");
    return { bucket, key: `${prefix.join("/")}/${objectPath.slice(9)}` };
  }

  async put(object: StoredObject, body: Buffer, contentType: string) {
    await r2.client().send(
      new PutObjectCommand({
        Bucket: object.bucket,
        Key: object.key,
        Body: body,
        ContentLength: body.length,
        ContentType: contentType,
      }),
    );
  }

  async read(object: StoredObject): Promise<Readable> {
    try {
      const result = await r2
        .client()
        .send(new GetObjectCommand({ Bucket: object.bucket, Key: object.key }));
      if (!result.Body) throw new ObjectNotFoundError();
      return result.Body as Readable;
    } catch (error) {
      if (isObjectNotFound(error)) throw new ObjectNotFoundError();
      throw error;
    }
  }

  // Returns the provider ETag, or null only for a confirmed 404.
  async inspect(object: StoredObject): Promise<string | null> {
    try {
      const result = await r2
        .client()
        .send(
          new HeadObjectCommand({ Bucket: object.bucket, Key: object.key }),
        );
      return result.ETag?.replace(/^"|"$/g, "") ?? "";
    } catch (error) {
      if (isObjectNotFound(error)) return null;
      throw error;
    }
  }

  async remove(object: StoredObject) {
    await r2
      .client()
      .send(
        new DeleteObjectCommand({ Bucket: object.bucket, Key: object.key }),
      );
  }
}
