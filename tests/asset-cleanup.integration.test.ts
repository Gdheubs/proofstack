import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import { runCommunityAction } from "../artifacts/api-server/src/services/community-actions";
import {
  assertOwnedAssets,
  requestUpload,
  storage,
} from "../artifacts/api-server/src/services/community-assets";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";

// Run only with an explicitly selected test database (embedded config is preferred).
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Durable asset cleanup",
  () => {
    const fixtures: { uid: string; id: string }[] = [];
    afterAll(async () => pool.end());
    afterEach(async () => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      for (const f of fixtures.splice(0)) {
        await pool.query("DELETE FROM asset_cleanup_jobs WHERE asset_id=$1", [
          f.id,
        ]);
        await pool.query("DELETE FROM users WHERE id=$1", [f.uid]);
      }
    });
    async function fixture(status = "ready") {
      vi.stubEnv("PRIVATE_OBJECT_DIR", "/test-bucket/private");
      vi.stubEnv(
        "R2_ENDPOINT",
        "https://0123456789abcdef.r2.cloudflarestorage.com",
      );
      vi.stubEnv("R2_ACCESS_KEY_ID", "disposable-test-key-id");
      vi.stubEnv("R2_SECRET_ACCESS_KEY", "disposable-test-secret");
      const uid = randomUUID(),
        id = randomUUID();
      fixtures.push({ uid, id });
      await pool.query(
        "INSERT INTO users(id,auth_subject,email) VALUES($1::uuid,$1::text,$2)",
        [uid, `${uid}@example.test`],
      );
      await pool.query(
        "INSERT INTO community_assets(id,user_id,object_path,content_type,size,status) VALUES($1,$2,$3,'image/png',8,$4)",
        [
          id,
          uid,
          `/objects/${status === "ready" ? "ready" : "uploads"}/${id}`,
          status,
        ],
      );
      return { uid, id, session: { user: { id: uid } } as AuthSession };
    }
    async function enqueue(f: Awaited<ReturnType<typeof fixture>>) {
      return runCommunityAction({ id: randomUUID() } as Request, f.session, {
        action: "asset-delete",
        id: f.id,
      });
    }
    it("retries failed storage durably and keeps quota reserved until deletion succeeds", async () => {
      const f = await fixture();
      expect(await enqueue(f)).toEqual({
        message: "Image deletion pending; quota remains reserved",
      });
      const { runAssetCleanupOnce } =
        await import("../artifacts/api-server/src/services/asset-cleanup-worker");
      const boundary = {
        inspect: vi.fn().mockResolvedValue("123"),
        remove: vi
          .fn()
          .mockRejectedValueOnce(
            new Error("provider credential must not be logged"),
          )
          .mockResolvedValue(undefined),
      };
      expect(await runAssetCleanupOnce(boundary)).toBe(true);
      expect(
        (
          await pool.query("SELECT status FROM community_assets WHERE id=$1", [
            f.id,
          ])
        ).rows,
      ).toEqual([{ status: "deleting" }]);
      const failed = (
        await pool.query("SELECT * FROM asset_cleanup_jobs WHERE asset_id=$1", [
          f.id,
        ])
      ).rows[0];
      expect(failed).toMatchObject({
        state: "pending",
        attempts: 1,
        generation: "123",
        last_error: "STORAGE_CLEANUP_FAILED",
        lease_token: null,
      });
      expect(new Date(failed.available_at).getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(await runAssetCleanupOnce(boundary)).toBe(false);
      await pool.query(
        "UPDATE asset_cleanup_jobs SET available_at=now() WHERE asset_id=$1",
        [f.id],
      );
      expect(await runAssetCleanupOnce(boundary)).toBe(true);
      expect(
        (await pool.query("SELECT * FROM community_assets WHERE id=$1", [f.id]))
          .rows,
      ).toEqual([]);
      expect(
        (
          await pool.query(
            "SELECT state,attempts FROM asset_cleanup_jobs WHERE asset_id=$1",
            [f.id],
          )
        ).rows,
      ).toEqual([{ state: "complete", attempts: 2 }]);
      expect(boundary.remove.mock.calls[1]?.[1]).toBe("123");
      expect(await runAssetCleanupOnce(boundary)).toBe(false);
    });
    it("reclaims an expired durable lease without losing its pinned generation", async () => {
      const f = await fixture();
      await enqueue(f);
      await pool.query(
        "UPDATE asset_cleanup_jobs SET state='leased',attempts=1,generation='123',lease_token=$2,leased_until=now()-interval '1 second' WHERE asset_id=$1",
        [f.id, randomUUID()],
      );
      const { runAssetCleanupOnce } =
        await import("../artifacts/api-server/src/services/asset-cleanup-worker");
      const boundary = {
        inspect: vi.fn().mockResolvedValue("123"),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      expect(await runAssetCleanupOnce(boundary)).toBe(true);
      expect(
        (
          await pool.query(
            "SELECT state,attempts FROM asset_cleanup_jobs WHERE asset_id=$1",
            [f.id],
          )
        ).rows,
      ).toEqual([{ state: "complete", attempts: 2 }]);
      expect(boundary.remove).toHaveBeenCalledTimes(1);
    });
    it("counts deleting assets against the upload quota until the worker acknowledges deletion", async () => {
      const f = await fixture();
      await enqueue(f);
      await pool.query(
        "INSERT INTO community_assets(user_id,object_path,content_type,size,status) SELECT $1,'/objects/uploads/' || gen_random_uuid(),'image/png',8,'pending' FROM generate_series(1,99)",
        [f.uid],
      );
      // Requesting an upload only reserves SQL state; it never touches storage.
      vi.spyOn(storage, "put").mockRejectedValue(
        new Error("must not reach storage"),
      );
      await expect(
        requestUpload(
          { name: "test.png", size: 8, contentType: "image/png" },
          f.uid,
        ),
      ).rejects.toMatchObject({ code: "UPLOAD_LIMIT" });
      const { runAssetCleanupOnce } =
        await import("../artifacts/api-server/src/services/asset-cleanup-worker");
      const boundary = {
        inspect: vi.fn().mockResolvedValue(null),
        remove: vi.fn(),
      };
      expect(await runAssetCleanupOnce(boundary)).toBe(true);
      expect(
        await requestUpload(
          { name: "test.png", size: 8, contentType: "image/png" },
          f.uid,
        ),
      ).toMatchObject({ uploadUrl: expect.any(String) });
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM community_assets WHERE user_id=$1",
            [f.uid],
          )
        ).rows,
      ).toEqual([{ n: 100 }]);
    });
    it("deduplicates repeated deletes and delays pending cleanup past URL and completion expiry", async () => {
      const f = await fixture("pending");
      await enqueue(f);
      await enqueue(f);
      const jobs = (
        await pool.query("SELECT * FROM asset_cleanup_jobs WHERE asset_id=$1", [
          f.id,
        ])
      ).rows;
      expect(jobs).toHaveLength(1);
      const asset = (
        await pool.query("SELECT * FROM community_assets WHERE id=$1", [f.id])
      ).rows[0];
      expect(
        new Date(jobs[0].available_at).getTime() -
          new Date(asset.created_at).getTime(),
      ).toBe(3600000);
      const { runAssetCleanupOnce } =
        await import("../artifacts/api-server/src/services/asset-cleanup-worker");
      const boundary = { inspect: vi.fn(), remove: vi.fn() };
      expect(await runAssetCleanupOnce(boundary)).toBe(false);
      expect(boundary.inspect).not.toHaveBeenCalled();
    });
    it("keeps quota reserved on generation mismatch and stops retrying after eight attempts", async () => {
      const f = await fixture();
      await enqueue(f);
      await pool.query(
        "UPDATE asset_cleanup_jobs SET generation='123',attempts=7 WHERE asset_id=$1",
        [f.id],
      );
      const { runAssetCleanupOnce } =
        await import("../artifacts/api-server/src/services/asset-cleanup-worker");
      const boundary = {
        inspect: vi.fn().mockResolvedValue("124"),
        remove: vi.fn(),
      };
      expect(await runAssetCleanupOnce(boundary)).toBe(true);
      expect(boundary.remove).not.toHaveBeenCalled();
      expect(
        (
          await pool.query(
            "SELECT state,attempts,generation,last_error FROM asset_cleanup_jobs WHERE asset_id=$1",
            [f.id],
          )
        ).rows,
      ).toEqual([
        {
          state: "failed",
          attempts: 8,
          generation: "123",
          last_error: "STORAGE_CLEANUP_FAILED",
        },
      ]);
      expect(
        (
          await pool.query("SELECT status FROM community_assets WHERE id=$1", [
            f.id,
          ])
        ).rows,
      ).toEqual([{ status: "deleting" }]);
      expect(await runAssetCleanupOnce(boundary)).toBe(false);
      expect(await enqueue(f)).toEqual({
        message:
          "Image cleanup needs operator attention; quota remains reserved",
      });
    });
    it("rejects a worker's stale lease before destructive work", async () => {
      const f = await fixture();
      await enqueue(f);
      const { runAssetCleanupOnce } =
        await import("../artifacts/api-server/src/services/asset-cleanup-worker");
      const boundary = {
        inspect: vi.fn(async () => {
          await pool.query(
            "UPDATE asset_cleanup_jobs SET lease_token=$2 WHERE asset_id=$1",
            [f.id, randomUUID()],
          );
          return "123";
        }),
        remove: vi.fn(),
      };
      expect(await runAssetCleanupOnce(boundary)).toBe(true);
      expect(boundary.remove).not.toHaveBeenCalled();
      expect(
        (
          await pool.query("SELECT status FROM community_assets WHERE id=$1", [
            f.id,
          ])
        ).rows,
      ).toEqual([{ status: "deleting" }]);
      expect(
        (
          await pool.query(
            "SELECT state,generation FROM asset_cleanup_jobs WHERE asset_id=$1",
            [f.id],
          )
        ).rows,
      ).toEqual([{ state: "leased", generation: null }]);
    });
    it("recovers deletion-before-ack failure through confirmed absence, without repeating a delete", async () => {
      const f = await fixture();
      await enqueue(f);
      const { runAssetCleanupOnce } =
        await import("../artifacts/api-server/src/services/asset-cleanup-worker");
      const boundary = {
        inspect: vi.fn().mockResolvedValueOnce("123").mockResolvedValue(null),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      // The provider succeeds but the subsequent DB commit cannot acknowledge it.
      await pool.query(
        "ALTER TABLE asset_cleanup_jobs ADD CONSTRAINT test_cleanup_ack_failure CHECK (state <> 'complete') NOT VALID",
      );
      try {
        expect(await runAssetCleanupOnce(boundary)).toBe(true);
      } finally {
        await pool.query(
          "ALTER TABLE asset_cleanup_jobs DROP CONSTRAINT test_cleanup_ack_failure",
        );
      }
      expect(
        (
          await pool.query(
            "SELECT state,generation FROM asset_cleanup_jobs WHERE asset_id=$1",
            [f.id],
          )
        ).rows,
      ).toEqual([{ state: "pending", generation: "123" }]);
      await pool.query(
        "UPDATE asset_cleanup_jobs SET available_at=now() WHERE asset_id=$1",
        [f.id],
      );
      expect(await runAssetCleanupOnce(boundary)).toBe(true);
      expect(boundary.remove).toHaveBeenCalledTimes(1);
      expect(
        (await pool.query("SELECT * FROM community_assets WHERE id=$1", [f.id]))
          .rows,
      ).toEqual([]);
    });
    it("does not release quota when a successful external delete loses its lease before acknowledgement", async () => {
      const f = await fixture();
      await enqueue(f);
      const { runAssetCleanupOnce } =
        await import("../artifacts/api-server/src/services/asset-cleanup-worker");
      const boundary = {
        inspect: vi.fn().mockResolvedValue("123"),
        remove: vi.fn(async () => {
          await pool.query(
            "UPDATE asset_cleanup_jobs SET leased_until=now()-interval '1 second' WHERE asset_id=$1",
            [f.id],
          );
        }),
      };
      expect(await runAssetCleanupOnce(boundary)).toBe(true);
      expect(
        (
          await pool.query("SELECT status FROM community_assets WHERE id=$1", [
            f.id,
          ])
        ).rows,
      ).toEqual([{ status: "deleting" }]);
      boundary.inspect.mockResolvedValue(null);
      expect(await runAssetCleanupOnce(boundary)).toBe(true);
      expect(boundary.remove).toHaveBeenCalledTimes(1);
      expect(
        (
          await pool.query(
            "SELECT state,attempts FROM asset_cleanup_jobs WHERE asset_id=$1",
            [f.id],
          )
        ).rows,
      ).toEqual([{ state: "complete", attempts: 2 }]);
    });
    it("captures location at enqueue and leaves a committed job after an account cascade", async () => {
      const f = await fixture();
      await enqueue(f);
      vi.stubEnv("PRIVATE_OBJECT_DIR", "/different-bucket/rotated");
      await pool.query("DELETE FROM users WHERE id=$1", [f.uid]);
      const { runAssetCleanupOnce } =
        await import("../artifacts/api-server/src/services/asset-cleanup-worker");
      const boundary = {
        inspect: vi.fn().mockResolvedValue(null),
        remove: vi.fn(),
      };
      expect(await runAssetCleanupOnce(boundary)).toBe(true);
      expect(boundary.inspect).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "test-bucket",
          namespace: "private",
          object_name: `private/ready/${f.id}`,
        }),
      );
      expect(
        (
          await pool.query(
            "SELECT state FROM asset_cleanup_jobs WHERE asset_id=$1",
            [f.id],
          )
        ).rows,
      ).toEqual([{ state: "complete" }]);
    });
    it("lets concurrent workers claim distinct jobs while storage I/O overlaps", async () => {
      const first = await fixture();
      const second = await fixture();
      await enqueue(first);
      await enqueue(second);
      const { runAssetCleanupOnce } =
        await import("../artifacts/api-server/src/services/asset-cleanup-worker");
      const claimed = new Set<string>();
      let release!: () => void;
      const bothInspecting = new Promise<void>((resolve) => {
        release = resolve;
      });
      // A broken claim must fail the assertions, not leave a hanging test.
      const timeout = setTimeout(() => release(), 3000).unref();
      const boundary = {
        inspect: vi.fn(async (target: { object_path: string }) => {
          claimed.add(target.object_path);
          if (claimed.size === 2) release();
          await bothInspecting;
          return "123";
        }),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      try {
        expect(
          await Promise.all([
            runAssetCleanupOnce(boundary),
            runAssetCleanupOnce(boundary),
          ]),
        ).toEqual([true, true]);
        expect(claimed.size).toBe(2);
        expect(boundary.remove).toHaveBeenCalledTimes(2);
        const jobs = await pool.query(
          "SELECT state,attempts FROM asset_cleanup_jobs WHERE asset_id=ANY($1::uuid[]) ORDER BY asset_id",
          [[first.id, second.id]],
        );
        expect(jobs.rows).toEqual([
          { state: "complete", attempts: 1 },
          { state: "complete", attempts: 1 },
        ]);
      } finally {
        clearTimeout(timeout);
        release();
      }
    });
    it("executes all journal migrations to the expected 50-table inventory", async () => {
      const result = await pool.query(
        "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
      );
      expect(result.rows).toEqual([{ n: 50 }]);
    });
    it("rejects traversal snapshots in the SQL constraint, not only in the SDK adapter", async () => {
      const f = await fixture();
      await enqueue(f);
      await expect(
        pool.query(
          "UPDATE asset_cleanup_jobs SET namespace='private/../victim',object_name='private/../victim/ready/' || asset_id WHERE asset_id=$1",
          [f.id],
        ),
      ).rejects.toThrow();
    });
    it("stores R2 ETags as pinned versions but rejects other values in SQL", async () => {
      const f = await fixture();
      await enqueue(f);
      const pin = (value: string) =>
        pool.query(
          "UPDATE asset_cleanup_jobs SET generation=$2 WHERE asset_id=$1",
          [f.id, value],
        );
      for (const value of [
        "0123456789abcdef0123456789abcdef",
        "0123456789abcdef0123456789abcdef-12",
        "123",
      ])
        await expect(pin(value)).resolves.toBeDefined();
      for (const value of [
        '"0123456789abcdef0123456789abcdef"',
        "0123456789ABCDEF0123456789ABCDEF",
        "0123456789abcdef0123456789abcdef-0",
        "0",
        "../victim",
      ])
        await expect(pin(value)).rejects.toThrow();
    });
    it("makes deletion terminal for completion and reattachment, including existing-path shortcuts", async () => {
      const f = await fixture("pending");
      await enqueue(f);
      const lookup = vi
        .spyOn(storage, "put")
        .mockRejectedValue(new Error("must not reach storage"));
      await expect(
        runCommunityAction({ id: randomUUID() } as Request, f.session, {
          action: "asset-complete",
          id: f.id,
        }),
      ).rejects.toMatchObject({ status: 409, code: "ASSET_DELETING" });
      expect(lookup).not.toHaveBeenCalled();
      const path = `/api/community/assets/${f.id}`;
      await expect(
        assertOwnedAssets(pool, f.uid, [path], [path]),
      ).rejects.toMatchObject({ status: 400, code: "OWNED_IMAGE_REQUIRED" });
      await expect(
        assertOwnedAssets(pool, f.uid, [path]),
      ).rejects.toMatchObject({ status: 400 });
    });
    it("never deletes bytes when the enclosing audit append fails and SQL rolls back", async () => {
      const f = await fixture();
      const remove = vi.spyOn(storage, "remove").mockResolvedValue();
      const lookup = vi
        .spyOn(storage, "inspect")
        .mockRejectedValue(new Error("must not reach storage"));
      // Real SQL failure after assetAction, not a mocked transaction/audit implementation.
      await pool.query(
        "ALTER TABLE audit_logs ADD CONSTRAINT test_asset_audit_failure CHECK (action <> 'community.asset-delete') NOT VALID",
      );
      try {
        await expect(
          runCommunityAction({ id: randomUUID() } as Request, f.session, {
            action: "asset-delete",
            id: f.id,
          }),
        ).rejects.toThrow();
        expect(
          (
            await pool.query(
              "SELECT status FROM community_assets WHERE id=$1",
              [f.id],
            )
          ).rows,
        ).toEqual([{ status: "ready" }]);
        expect(remove).not.toHaveBeenCalled();
        expect(lookup).not.toHaveBeenCalled();
        expect(
          (
            await pool.query(
              "SELECT * FROM asset_cleanup_jobs WHERE asset_id=$1",
              [f.id],
            )
          ).rows,
        ).toEqual([]);
        const { runAssetCleanupOnce } =
          await import("../artifacts/api-server/src/services/asset-cleanup-worker");
        const boundary = { inspect: vi.fn(), remove: vi.fn() };
        expect(await runAssetCleanupOnce(boundary)).toBe(false);
        expect(boundary.inspect).not.toHaveBeenCalled();
      } finally {
        await pool.query(
          "ALTER TABLE audit_logs DROP CONSTRAINT test_asset_audit_failure",
        );
      }
    });
  },
);
