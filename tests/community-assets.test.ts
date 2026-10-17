import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assetAction,
  storage,
} from "../artifacts/api-server/src/services/community-assets";
import {
  ObjectNotFoundError,
  objectStorageClient,
} from "../artifacts/api-server/src/lib/objectStorage";
import type { CommunityDb } from "../artifacts/api-server/src/services/community-policy";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
const uid = "cc1575d2-514f-42fb-97b4-f6b6b7503a75";
const id = "cc1575d2-514f-42fb-97b4-f6b6b7503a76";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("Immutable image completion", () => {
  function fixture(valid = true) {
    const row = {
      id,
      user_id: uid,
      object_path: "/objects/uploads/staging",
      status: "pending",
      content_type: "image/png",
      size: 8,
      created_at: new Date(),
    };
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const source = {
      download: vi
        .fn()
        .mockResolvedValue([
          valid
            ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
            : Buffer.from("notimage"),
        ]),
      copy: vi.fn().mockResolvedValue([]),
    };
    const destination = {};
    const file = {
      name: "private/uploads/staging",
      getMetadata: vi
        .fn()
        .mockResolvedValue([
          { size: "8", contentType: "image/png", generation: "123" },
        ]),
      bucket: {
        file: vi.fn().mockReturnValueOnce(source).mockReturnValue(destination),
      },
    };
    vi.spyOn(storage, "getObjectEntityFile").mockResolvedValue(file as never);
    const acl = vi
      .spyOn(storage, "trySetObjectEntityAclPolicy")
      .mockResolvedValue("unused");
    return { query, source, destination, file, acl };
  }
  it("validates a pinned generation and publishes only a separate private object", async () => {
    const f = fixture();
    await assetAction(
      { query: f.query } as unknown as CommunityDb,
      { user: { id: uid } } as AuthSession,
      { action: "asset-complete", id },
    );
    expect(f.file.bucket.file.mock.calls[0]).toEqual([
      "private/uploads/staging",
      { generation: "123" },
    ]);
    expect(f.source.copy).toHaveBeenCalledWith(f.destination, {
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    expect(f.acl).toHaveBeenCalledWith(
      expect.stringMatching(/^\/objects\/ready\//),
      { owner: uid, visibility: "private" },
    );
    expect(f.query.mock.calls.at(-1)?.[1]).toEqual([
      id,
      expect.stringMatching(/^\/objects\/ready\//),
    ]);
  });
  it("does not copy or mark invalid image bytes ready", async () => {
    const f = fixture(false);
    await expect(
      assetAction(
        { query: f.query } as unknown as CommunityDb,
        { user: { id: uid } } as AuthSession,
        { action: "asset-complete", id },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.source.copy).not.toHaveBeenCalled();
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it("queues abandoned upload cleanup without cloud I/O or quota release before commit", async () => {
    vi.stubEnv("PRIVATE_OBJECT_DIR", "/test-bucket/private");
    const createdAt = new Date("2026-10-15T00:00:00Z");
    const objectPath = `/objects/uploads/${id}`;
    const query = vi.fn().mockResolvedValue({ rows: [] });
    query.mockResolvedValueOnce({
      rows: [
        {
          id,
          user_id: uid,
          object_path: objectPath,
          status: "pending",
          created_at: createdAt,
        },
      ],
    });
    // The old implementation inspected storage and immediately released quota
    // on 404, even though the signed PUT and enclosing transaction were live.
    const lookup = vi
      .spyOn(storage, "getObjectEntityFile")
      .mockRejectedValue(new ObjectNotFoundError());
    const bucket = vi
      .spyOn(objectStorageClient, "bucket")
      .mockImplementation(() => {
        throw new Error("Cloud must not be reached before commit");
      });
    await expect(
      assetAction(
        { query } as unknown as CommunityDb,
        { user: { id: uid } } as AuthSession,
        { action: "asset-delete", id },
      ),
    ).resolves.toEqual({
      message: "Image deletion pending; quota remains reserved",
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(bucket).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[2]?.[0]).toContain(
      "INSERT INTO asset_cleanup_jobs",
    );
    expect(query.mock.calls[2]?.[0]).toContain("interval '1 hour'");
    expect(query.mock.calls[2]?.[1]).toEqual([
      id,
      objectPath,
      "test-bucket",
      "private",
      `private/uploads/${id}`,
      "pending",
      createdAt,
    ]);
    expect(query.mock.calls[3]).toEqual([
      "UPDATE community_assets SET status='deleting' WHERE id=$1",
      [id],
    ]);
    expect(
      query.mock.calls.some(([sql]) =>
        /DELETE FROM community_assets/i.test(sql),
      ),
    ).toBe(false);
  });
});
