import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { rewriteOrigins } from "../lib/db/scripts/rewrite-origins.mjs";

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "saved links after the site moves to a custom domain",
  () => {
    afterAll(async () => {
      await pool.end();
    });

    it("rewrites only links on the old origin, keeping their paths", async () => {
      const owner = randomUUID();
      await pool.query(
        "INSERT INTO users(id,auth_subject,email) VALUES($1,$2,$3)",
        [owner, owner, owner + "@example.test"],
      );
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      const rows: [string, string, string][] = [
        [
          ids[0],
          "https://Old.Workers.dev/suhai/app",
          "https://demos-old.workers.dev/suhai/app/",
        ],
        [ids[1], "https://github.com/x/y", "https://old.workers.dev"],
        [ids[2], "", "https://old.workers.dev.evil.example/a"],
      ];
      for (const [id, repo, demo] of rows)
        await pool.query(
          "INSERT INTO community_projects(id,owner_id,slug,title,description,visibility,repository_url,demo_url) VALUES($1,$2,$3,'T','F','public',$4,$5)",
          [id, owner, id, repo, demo],
        );
      const query = (text: string, values?: unknown[]) =>
        pool.query(text, values);
      expect(
        await rewriteOrigins(
          query,
          "https://old.workers.dev",
          "https://proofstack.online",
        ),
      ).toEqual({ repository_url: 1, demo_url: 1 });
      await expect(
        rewriteOrigins(query, "https://old.workers.dev/path", "https://x.y"),
      ).rejects.toThrow("ORIGIN_FROM");
      const saved = (
        await pool.query(
          "SELECT id,repository_url,demo_url FROM community_projects WHERE owner_id=$1 ORDER BY slug",
          [owner],
        )
      ).rows as { id: string; repository_url: string; demo_url: string }[];
      const by = Object.fromEntries(saved.map((r) => [r.id, r]));
      expect(by[ids[0]].repository_url).toBe(
        "https://proofstack.online/suhai/app",
      );
      expect(by[ids[0]].demo_url).toBe(
        "https://demos-old.workers.dev/suhai/app/",
      );
      expect(by[ids[1]].demo_url).toBe("https://proofstack.online");
      expect(by[ids[2]].demo_url).toBe(
        "https://old.workers.dev.evil.example/a",
      );
      await pool.query("DELETE FROM users WHERE id=$1", [owner]);
    });
  },
);
