import { describe, expect, it, vi } from "vitest";
import {
  claimLifecycleJob,
  completeLifecycleJob,
  enqueueLifecycleJob,
  reserveLifecycleUpload,
} from "../artifacts/api-server/src/services/asset-lifecycle-store";

const db = (...rows: unknown[][]) => ({
  query: vi
    .fn()
    .mockImplementation(() => Promise.resolve({ rows: rows.shift() || [] })),
});
const asPoolClient = (client: ReturnType<typeof db>) =>
  client as unknown as Parameters<typeof reserveLifecycleUpload>[0];
const identity = (key: string) => ({
  provider: "supabase",
  bucket: "assets",
  objectKey: key,
});

describe("inactive asset lifecycle store", () => {
  it("reserves two immutable identities before creating an upload attempt", async () => {
    const client = db(
      [{ id: "q" }],
      [{ id: "r" }],
      [{ id: "a", fence_token: 0 }],
    );
    await expect(
      reserveLifecycleUpload(asPoolClient(client), {
        assetId: "a",
        userId: "u",
        quarantine: identity("quarantine/a"),
        ready: identity("ready/a"),
        expectedSize: 1,
        contentType: "image/png",
        expiresAt: new Date(),
      }),
    ).resolves.toEqual({ id: "a", fence_token: 0 });
    expect(client.query).toHaveBeenCalledTimes(3);
  });
  it("rejects unsafe identities before database work", async () => {
    const client = db();
    await expect(
      reserveLifecycleUpload(asPoolClient(client), {
        assetId: "a",
        userId: "u",
        quarantine: identity("../x"),
        ready: identity("ready/a"),
        expectedSize: 1,
        contentType: "image/png",
        expiresAt: new Date(),
      }),
    ).rejects.toThrow("INVALID_ASSET_LIFECYCLE_RESERVATION");
    expect(client.query).not.toHaveBeenCalled();
  });
  it("uses idempotency conflict handling and fence-token completion CAS", async () => {
    const client = db([], [{ id: "j", fence_token: 2 }], [], [{ id: "j" }]);
    expect(
      await enqueueLifecycleJob(asPoolClient(client), {
        objectId: "o",
        kind: "cleanup",
        idempotencyKey: "cleanup:o",
      }),
    ).toBeNull();
    expect(await claimLifecycleJob(asPoolClient(client))).toMatchObject({
      fence_token: 2,
    });
    expect(
      await completeLifecycleJob(asPoolClient(client), {
        id: "j",
        leaseToken: "old",
        fenceToken: 1,
      }),
    ).toBe(false);
    expect(
      await completeLifecycleJob(asPoolClient(client), {
        id: "j",
        leaseToken: "new",
        fenceToken: 2,
      }),
    ).toBe(true);
  });
});
