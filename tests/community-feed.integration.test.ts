import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import { CommunityReader } from "../artifacts/api-server/src/services/community-reader";

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Batched community feed",
  () => {
    afterAll(async () => {
      await pool.end();
    });
    it("keeps query count bounded across 21 authors and preserves viewer-aware counts, reactions and comment paging", async () => {
      const users = Array.from({ length: 22 }, () => randomUUID());
      const posts = Array.from({ length: 21 }, () => randomUUID());
      try {
        await pool.query(
          "INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) AS ids(id)",
          [users],
        );
        await pool.query(
          "INSERT INTO profiles(user_id,display_name,handle) SELECT id,'TEST fixture','test_'||replace(id::text,'-','') FROM unnest($1::uuid[]) AS ids(id)",
          [users],
        );
        await pool.query(
          "INSERT INTO community_posts(id,author_id,body,mentions) SELECT id,author,'TEST post',jsonb_build_array($3::text) FROM unnest($1::uuid[],$2::uuid[]) AS rows(id,author)",
          [posts, users.slice(0, 21), users[1]],
        );
        await pool.query(
          "INSERT INTO community_comments(post_id,author_id,body,created_at) SELECT id,$2,'Comment '||n,now()+n*interval '1 second' FROM unnest($1::uuid[]) AS ids(id) CROSS JOIN generate_series(1,4) AS series(n)",
          [posts, users[1]],
        );
        await pool.query(
          "INSERT INTO community_comments(post_id,author_id,body) VALUES($1,$2,'Disabled author')",
          [posts[0], users[21]],
        );
        await pool.query(
          "INSERT INTO community_reactions(user_id,target_type,target_id,kind) SELECT $1,'post',id,'like' FROM unnest($2::uuid[]) AS ids(id)",
          [users[0], posts],
        );
        await pool.query(
          "INSERT INTO community_reactions(user_id,target_type,target_id,kind) VALUES($1,'post',$2,'like')",
          [users[21], posts[0]],
        );
        await pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
          users[21],
        ]);
        await pool.query(
          "INSERT INTO community_bookmarks(user_id,target_type,target_id) VALUES($1,'post',$2)",
          [users[0], posts[0]],
        );
        const query = vi.spyOn(pool, "query");
        let feed;
        try {
          feed = await new CommunityReader(users[0]).posts(
            "p.id=ANY($2::uuid[])",
            [posts],
          );
          expect(query.mock.calls.length).toBeLessThanOrEqual(7);
          console.info(
            `Feed fixture: ${feed.length} posts, ${query.mock.calls.length} database queries`,
          );
        } finally {
          query.mockRestore();
        }
        expect(feed).toHaveLength(21);
        for (const post of feed) {
          expect(post.commentCount).toBe(4);
          expect(post.comments.map((c) => c.body)).toEqual([
            "Comment 1",
            "Comment 2",
            "Comment 3",
          ]);
          expect(post.reactions.find((r) => r.kind === "like")).toEqual({
            kind: "like",
            count: 1,
            active: true,
          });
          expect(post.mentions[0].id).toBe(users[1]);
          expect(post.bookmarked).toBe(post.id === posts[0]);
        }
        const detail = await new CommunityReader(null).posts(
          "p.id=$2",
          [posts[0]],
          3,
          true,
        );
        expect(detail[0].comments.map((c) => c.body)).toEqual(["Comment 4"]);
        expect(detail[0].bookmarked).toBe(false);
        expect(detail[0].reactions[0].active).toBe(false);
      } finally {
        await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
      }
    });
  },
);
