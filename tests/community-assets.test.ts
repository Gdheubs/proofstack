import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assetAction,
  storage,
} from "../artifacts/api-server/src/services/community-assets";
import { ObjectNotFoundError } from "../artifacts/api-server/src/lib/objectStorage";
import type { CommunityDb } from "../artifacts/api-server/src/services/community-policy";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
const uid = "cc1575d2-514f-42fb-97b4-f6b6b7503a75";
const id = "cc1575d2-514f-42fb-97b4-f6b6b7503a76";
afterEach(() => vi.restoreAllMocks());
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
  it("releases an abandoned upload reservation when no object was uploaded", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    query.mockResolvedValueOnce({
      rows: [
        {
          id,
          user_id: uid,
          object_path: "/objects/uploads/missing",
          status: "pending",
        },
      ],
    });
    vi.spyOn(storage, "getObjectEntityFile").mockRejectedValue(
      new ObjectNotFoundError(),
    );
    await expect(
      assetAction(
        { query } as unknown as CommunityDb,
        { user: { id: uid } } as AuthSession,
        { action: "asset-delete", id },
      ),
    ).resolves.toEqual({ message: "Unused image deleted" });
    expect(query.mock.calls.at(-1)?.[0]).toBe(
      "DELETE FROM community_assets WHERE id=$1",
    );
  });
});
