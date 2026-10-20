import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import {
  assetAccess,
  storage,
} from "../artifacts/api-server/src/services/community-assets";

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Direct asset visibility follows active resource owners",
  () => {
    afterEach(() => vi.restoreAllMocks());
    afterAll(async () => {
      await pool.end();
    });

    it.each(["active", "disabled"] as const)(
      "%s owner reference enforces the expected anonymous asset policy",
      async (status) => {
        const owner = randomUUID();
        const project = randomUUID();
        const asset = randomUUID();
        const path = `/api/community/assets/${asset}`;
        const objectRead = vi
          .spyOn(storage, "locate")
          .mockReturnValue({ bucket: "test-bucket", key: "private/test" });
        try {
          await pool.query("BEGIN");
          await pool.query(
            "INSERT INTO users(id,auth_subject,email,status) VALUES($1::uuid,$1::text,$2,$3)",
            [owner, `${owner}@example.test`, status],
          );
          await pool.query(
            "INSERT INTO community_assets(id,user_id,object_path,content_type,size,status) VALUES($1,$2,$3,'image/png',8,'ready')",
            [asset, owner, `/objects/ready/${randomUUID()}`],
          );
          await pool.query(
            "INSERT INTO community_projects(id,owner_id,slug,title,description,screenshots) VALUES($1::uuid,$2,$1::text,'Disabled reference','Fixture',$3::jsonb)",
            [project, owner, JSON.stringify([path])],
          );
          if (status === "disabled") {
            await expect(assetAccess(asset, null)).rejects.toMatchObject({
              status: 404,
            });
            expect(objectRead).not.toHaveBeenCalled();
          } else {
            await expect(assetAccess(asset, null)).resolves.toMatchObject({
              isPublic: true,
            });
            expect(objectRead).toHaveBeenCalledOnce();
          }
        } finally {
          await pool.query("ROLLBACK");
        }
      },
    );
  },
);
