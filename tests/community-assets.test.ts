import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  query: vi.fn(),
  audit: vi.fn(),
}));
vi.mock(
  "../artifacts/api-server/src/services/auth-sessions",
  async (original) => ({
    ...(await original<object>()),
    transaction: (fn: (db: { query: typeof tx.query }) => unknown) =>
      fn({ query: tx.query }),
    audit: tx.audit,
  }),
);

import {
  assetAction,
  requestUpload,
  storage,
  storeAssetContent,
} from "../artifacts/api-server/src/services/community-assets";
import { r2 } from "../artifacts/api-server/src/lib/objectStorage";
import type { CommunityDb } from "../artifacts/api-server/src/services/community-policy";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";

const uid = "cc1575d2-514f-42fb-97b4-f6b6b7503a75";
const id = "cc1575d2-514f-42fb-97b4-f6b6b7503a76";
const objectId = "cc1575d2-514f-42fb-97b4-f6b6b7503a77";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const req = { id: "request" } as unknown as Request;

beforeEach(() => {
  vi.stubEnv("PRIVATE_OBJECT_DIR", "/test-bucket/private");
  vi.stubEnv(
    "R2_ENDPOINT",
    "https://0123456789abcdef.r2.cloudflarestorage.com",
  );
  vi.stubEnv("R2_ACCESS_KEY_ID", "disposable-test-key-id");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "disposable-test-secret");
  tx.query.mockReset();
  tx.audit.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function pending(patch: Record<string, unknown> = {}) {
  const row = {
    id,
    user_id: uid,
    object_path: `/objects/ready/${objectId}`,
    status: "pending",
    content_type: "image/png",
    size: png.length,
    created_at: new Date(),
    ...patch,
  };
  tx.query.mockResolvedValue({ rows: [] });
  tx.query.mockResolvedValueOnce({ rows: [row] });
  return row;
}
const updates = () =>
  tx.query.mock.calls.filter(([sql]) => /^UPDATE community_assets/.test(sql));

describe("API-side image ingest", () => {
  it("reserves a final key and returns a same-origin upload URL without storage I/O", async () => {
    const client = vi.spyOn(r2, "client");
    tx.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id }] });
    expect(
      await requestUpload(
        { name: "a.png", size: 8, contentType: "image/png" },
        uid,
      ),
    ).toEqual({
      id,
      uploadUrl: `/api/community/assets/${id}/content`,
      assetPath: `/api/community/assets/${id}`,
    });
    expect(tx.query.mock.calls[2][1][1]).toMatch(
      /^\/objects\/ready\/[0-9a-f-]{36}$/,
    );
    expect(client).not.toHaveBeenCalled();
  });

  it("stores validated bytes at the reserved key, then marks the image ready and audits", async () => {
    pending();
    const put = vi.spyOn(storage, "put").mockResolvedValue();
    await expect(
      storeAssetContent(req, uid, id, "image/png; charset=binary", png),
    ).resolves.toEqual({ message: "Image upload completed", id });
    expect(put).toHaveBeenCalledWith(
      { bucket: "test-bucket", key: `private/ready/${objectId}` },
      png,
      "image/png",
    );
    expect(updates()).toEqual([
      ["UPDATE community_assets SET status='ready' WHERE id=$1", [id]],
    ]);
    expect(tx.audit).toHaveBeenCalledWith(
      req,
      "community.asset-upload",
      uid,
      id,
      {},
      expect.anything(),
    );
  });

  it.each([
    ["a mismatched signature", {}, "image/png", Buffer.from("notimage")],
    [
      "a size different from the reservation",
      {},
      "image/png",
      Buffer.concat([png, png]),
    ],
    ["a different content type", {}, "image/jpeg", png],
    ["a missing content type", {}, undefined, png],
    ["an oversized declaration", { size: 8388609 }, "image/png", png],
  ])("rejects %s before writing", async (_label, patch, type, body) => {
    pending(patch);
    const put = vi.spyOn(storage, "put").mockResolvedValue();
    await expect(
      storeAssetContent(req, uid, id, type, body),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_IMAGE" });
    expect(put).not.toHaveBeenCalled();
    expect(updates()).toEqual([]);
  });

  it.each([
    ["another user's asset", { user_id: id }, 403, "PERMISSION_DENIED"],
    ["a completed asset", { status: "ready" }, 409, "UPLOAD_COMPLETE"],
    ["a deleting asset", { status: "deleting" }, 409, "ASSET_DELETING"],
    [
      "an expired reservation",
      { created_at: new Date(Date.now() - 3600001) },
      409,
      "UPLOAD_EXPIRED",
    ],
  ])("refuses %s without storage I/O", async (_label, patch, status, code) => {
    pending(patch);
    const put = vi.spyOn(storage, "put").mockResolvedValue();
    const rejection = storeAssetContent(req, uid, id, "image/png", png);
    await expect(rejection).rejects.toMatchObject({ status });
    if (code !== "PERMISSION_DENIED")
      await expect(rejection).rejects.toMatchObject({ code });
    expect(put).not.toHaveBeenCalled();
    expect(updates()).toEqual([]);
  });

  it("does not mark the image ready when the storage write fails", async () => {
    pending();
    vi.spyOn(storage, "put").mockRejectedValue(new Error("provider down"));
    await expect(
      storeAssetContent(req, uid, id, "image/png", png),
    ).rejects.toThrow("provider down");
    expect(updates()).toEqual([]);
    expect(tx.audit).not.toHaveBeenCalled();
  });

  it("returns a structured 503 before any SQL when R2 credentials are missing", async () => {
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    await expect(
      storeAssetContent(req, uid, id, "image/png", png),
    ).rejects.toMatchObject({
      status: 503,
      code: "STORAGE_CONFIGURATION_REQUIRED",
    });
    expect(tx.query).not.toHaveBeenCalled();
  });
});

describe("asset completion and deletion", () => {
  const session = { user: { id: uid } } as AuthSession;
  const action = (
    query: ReturnType<typeof vi.fn>,
    act: "asset-complete" | "asset-delete",
  ) =>
    assetAction({ query } as unknown as CommunityDb, session, {
      action: act,
      id,
    });

  it("requires uploaded content before completion and confirms ready images", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ id, user_id: uid, status: "pending" }],
    });
    await expect(action(query, "asset-complete")).rejects.toMatchObject({
      status: 409,
      code: "UPLOAD_CONTENT_REQUIRED",
    });
    query.mockResolvedValueOnce({
      rows: [{ id, user_id: uid, status: "ready" }],
    });
    await expect(action(query, "asset-complete")).resolves.toEqual({
      message: "Image upload completed",
      id,
    });
  });

  it("queues abandoned upload cleanup without cloud I/O or quota release before commit", async () => {
    const createdAt = new Date("2026-10-15T00:00:00Z");
    const objectPath = `/objects/ready/${objectId}`;
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
    const client = vi.spyOn(r2, "client").mockImplementation(() => {
      throw new Error("Cloud must not be reached before commit");
    });
    await expect(action(query, "asset-delete")).resolves.toEqual({
      message: "Image deletion pending; quota remains reserved",
    });
    expect(client).not.toHaveBeenCalled();
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
      `private/ready/${objectId}`,
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
