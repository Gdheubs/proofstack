import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import * as modules from "../lib/db/src/modules";
import {
  EXPORT_POLICY,
  exportRule,
} from "../artifacts/api-server/src/services/export-policy";

const folder = fileURLToPath(new URL("../lib/db/drizzle/", import.meta.url));
type Snapshot = {
  tables: Record<string, unknown>;
};
const snapshot = (index: string) =>
  JSON.parse(
    readFileSync(`${folder}meta/${index}_snapshot.json`, "utf8"),
  ) as Snapshot;
const names = (value: Snapshot) =>
  Object.keys(value.tables)
    .map((key) => key.replace(/^public\./, ""))
    .sort();

const MEDIA_TABLES = [
  "media_cleanup_jobs",
  "media_objects",
  "media_renditions",
  "media_uploads",
];
const SOCIAL_TABLES = [
  "community_blocks",
  "community_post_details",
  "community_post_media",
  "community_post_topics",
  "community_reposts",
  "community_routines",
  "community_topics",
  "content_reports",
  "content_restrictions",
  "content_suspensions",
];
const TABLES = [...MEDIA_TABLES, ...SOCIAL_TABLES];
const USER_KEYS: Record<string, "c" | "n"> = {
  "community_blocks.blocked_id": "c",
  "community_blocks.blocker_id": "c",
  "community_reposts.user_id": "c",
  "community_routines.author_id": "c",
  "content_reports.handled_by": "n",
  "content_reports.reporter_id": "n",
  "content_restrictions.actor_id": "n",
  "content_restrictions.lifted_by": "n",
  "content_suspensions.actor_id": "n",
  "content_suspensions.user_id": "c",
  "media_objects.created_by": "n",
  "media_objects.owner_id": "c",
};

const tableName = (table: unknown) =>
  (table as Record<symbol, string | undefined>)[Symbol.for("drizzle:Name")];

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "migration 0023_media_social",
  () => {
    const connect = () => pool.connect();
    let client: Awaited<ReturnType<typeof connect>>;
    const query = (text: string, values: unknown[] = []) =>
      client.query(text, values);
    let user: string;
    let other: string;
    let post: string;
    let topic: string;

    beforeAll(async () => {
      client = await connect();
      await query("BEGIN");
      user = await person();
      other = await person();
      post = await communityPost(user);
      topic = await communityTopic();
    });

    afterAll(async () => {
      await query("ROLLBACK");
      client.release();
      await pool.end();
    });

    async function person() {
      const id = randomUUID();
      await query("INSERT INTO users(id,auth_subject,email) VALUES($1,$2,$3)", [
        id,
        `media-social-${id}`,
        `${id}@example.test`,
      ]);
      return id;
    }

    async function communityPost(authorId: string) {
      const id = randomUUID();
      await query(
        "INSERT INTO community_posts(id,author_id,body) VALUES($1,$2,'fixture')",
        [id, authorId],
      );
      return id;
    }

    async function communityTopic() {
      const id = randomUUID();
      await query(
        "INSERT INTO community_topics(id,slug,label) VALUES($1,$2,'Fixture topic')",
        [id, `topic_${id.replaceAll("-", "").slice(0, 12)}`],
      );
      return id;
    }

    async function mediaObject({
      ownerId = user,
      creatorId = user,
      purpose = "post",
      storage = "r2_social",
      objectPath = `/objects/ready/${randomUUID()}`,
      externalId = null,
    }: {
      ownerId?: string | null;
      creatorId?: string | null;
      purpose?: string;
      storage?: string;
      objectPath?: string | null;
      externalId?: string | null;
    } = {}) {
      const id = randomUUID();
      await query(
        `INSERT INTO media_objects
          (id,owner_id,created_by,kind,purpose,storage,namespace,object_path,external_id,state,content_type,declared_bytes)
         VALUES($1,$2,$3,'image',$4,$5,'social',$6,$7,'ready','image/webp',1024)`,
        [id, ownerId, creatorId, purpose, storage, objectPath, externalId],
      );
      return id;
    }

    async function rolledBack<T>(work: () => Promise<T>) {
      await query("SAVEPOINT scoped");
      try {
        return await work();
      } finally {
        await query("ROLLBACK TO SAVEPOINT scoped");
        await query("RELEASE SAVEPOINT scoped");
      }
    }

    async function refuses(
      constraint: string,
      text: string,
      values: unknown[] = [],
    ) {
      await rolledBack(() =>
        expect(query(text, values)).rejects.toMatchObject({
          code: constraint.endsWith("_check") ? "23514" : "23505",
          constraint,
        }),
      );
    }

    it("keeps all fourteen tables in the module barrel outside the core schema", async () => {
      expect(Object.values(modules.media).map(tableName).sort()).toEqual(
        MEDIA_TABLES,
      );
      expect(Object.values(modules.social).map(tableName).sort()).toEqual(
        SOCIAL_TABLES,
      );
      const count = Number(
        (
          await query(
            "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
          )
        ).rows[0].count,
      );
      expect(count).toBe(80);
      expect(names(snapshot("0023"))).toHaveLength(80);
    });

    it("enforces ownership, safe object paths and bounded post media positions", async () => {
      const invalidContent = randomUUID();
      await refuses(
        "media_objects_content_owner_id_check",
        `INSERT INTO media_objects
          (id,owner_id,kind,purpose,storage,namespace,object_path,state,content_type,declared_bytes)
         VALUES($1,$2,'image','question','r2_evidence','evidence',$3,'ready','image/png',100)`,
        [invalidContent, user, `/objects/ready/${invalidContent}`],
      );

      const missingOwner = randomUUID();
      await refuses(
        "media_objects_content_owner_id_check",
        `INSERT INTO media_objects
          (id,kind,purpose,storage,namespace,object_path,state,content_type,declared_bytes)
         VALUES($1,'image','post','r2_social','social',$2,'ready','image/png',100)`,
        [missingOwner, `/objects/ready/${missingOwner}`],
      );

      const invalidPath = randomUUID();
      await refuses(
        "media_objects_object_path_check",
        `INSERT INTO media_objects
          (id,owner_id,created_by,kind,purpose,storage,namespace,object_path,state,content_type,declared_bytes)
         VALUES($1,$2,$2,'image','post','r2_social','social','/objects/private/secret','ready','image/png',100)`,
        [invalidPath, user],
      );

      const mediaId = await mediaObject();
      await query(
        "INSERT INTO community_post_media(post_id,position,media_id,alt) VALUES($1,0,$2,'fixture')",
        [post, mediaId],
      );
      await refuses(
        "community_post_media_pk",
        "INSERT INTO community_post_media(post_id,position,media_id) VALUES($1,0,$2)",
        [post, await mediaObject()],
      );
      await refuses(
        "community_post_media_media_unique",
        "INSERT INTO community_post_media(post_id,position,media_id) VALUES($1,0,$2)",
        [await communityPost(other), mediaId],
      );
      await refuses(
        "community_post_media_position_check",
        "INSERT INTO community_post_media(post_id,position,media_id) VALUES($1,4,$2)",
        [post, await mediaObject()],
      );
    });

    it("enforces routine uniqueness, active restrictions and non-self blocks", async () => {
      const routinePost = await communityPost(user);
      await query(
        `INSERT INTO community_routines(post_id,author_id,day,items,minutes)
         VALUES($1,$2,'2026-11-20','[{"label":"practice","done":true}]',25)`,
        [routinePost, user],
      );
      await refuses(
        "community_routines_author_day_unique",
        `INSERT INTO community_routines(post_id,author_id,day,items,minutes)
         VALUES($1,$2,'2026-11-20','[]',0)`,
        [await communityPost(user), user],
      );

      const restrictionPost = await communityPost(user);
      await query(
        `INSERT INTO content_restrictions(target_type,target_id,action,reason_code)
         VALUES('post',$1,'hidden','spam')`,
        [restrictionPost],
      );
      await refuses(
        "content_restrictions_active_target_unique",
        `INSERT INTO content_restrictions(target_type,target_id,action,reason_code)
         VALUES('post',$1,'removed','repeat')`,
        [restrictionPost],
      );
      await refuses(
        "community_blocks_not_self_check",
        "INSERT INTO community_blocks(blocker_id,blocked_id) VALUES($1,$1)",
        [user],
      );
    });

    it("classifies every user foreign key and protects other people's block/report data", async () => {
      const keys = (
        await query(
          `SELECT c.conrelid::regclass::text AS "table",a.attname::text AS "column",c.confdeltype::text AS action
           FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
           WHERE c.contype='f' AND c.confrelid='public.users'::regclass`,
        )
      ).rows as { table: string; column: string; action: string }[];
      const mediaSocial = keys.filter((key) => TABLES.includes(key.table));
      expect(
        Object.fromEntries(
          mediaSocial.map((key) => [`${key.table}.${key.column}`, key.action]),
        ),
      ).toEqual(USER_KEYS);
      expect(
        Object.keys(EXPORT_POLICY)
          .filter((key) => TABLES.includes(key.split(".")[0]))
          .sort(),
      ).toEqual(Object.keys(USER_KEYS).sort());
      expect(exportRule("community_blocks", "blocker_id")).toBe("full");
      expect(exportRule("community_blocks", "blocked_id")).toBe("none");
      expect(exportRule("content_reports", "reporter_id")).toBe("none");
      expect(exportRule("media_cleanup_jobs", "id")).toBeUndefined();
      expect(
        keys
          .filter((key) => TABLES.includes(key.table))
          .every((key) => ["c", "n"].includes(key.action)),
      ).toBe(true);
      expect(
        (
          await query(
            `SELECT count(*)::int AS count FROM pg_constraint c
           WHERE c.contype='f' AND c.conrelid='public.media_cleanup_jobs'::regclass`,
          )
        ).rows[0].count,
      ).toBe(0);
    });

    it("erases personal media and social rows while retaining content and cleanup work", async () => {
      const personalMedia = await mediaObject();
      const personalPath = `/objects/ready/${randomUUID()}`;
      await query(
        `INSERT INTO media_objects
          (id,created_by,kind,purpose,storage,namespace,object_path,state,content_type,declared_bytes)
         VALUES($1,$2,'image','question','r2_evidence','evidence',$3,'ready','image/png',200)`,
        [randomUUID(), user, personalPath],
      );
      const contentMediaId = (
        await query("SELECT id FROM media_objects WHERE object_path=$1", [
          personalPath,
        ])
      ).rows[0].id as string;
      await query(
        `INSERT INTO media_uploads(media_id,encrypted_payload,state,expires_at)
         VALUES($1,'sealed','open',now()+interval '1 hour')`,
        [personalMedia],
      );
      const renditionPath = `/objects/ready/${randomUUID()}`;
      await query(
        `INSERT INTO media_renditions(media_id,kind,object_path,namespace,content_type)
         VALUES($1,'poster',$2,'social','image/webp')`,
        [personalMedia, renditionPath],
      );
      await query(
        `INSERT INTO media_cleanup_jobs(provider,external_id)
         VALUES('stream',$1)`,
        [`external-${randomUUID()}`],
      );
      await query(
        "INSERT INTO community_post_details(post_id,kind) VALUES($1,'video')",
        [post],
      );
      await query(
        "INSERT INTO community_post_media(post_id,position,media_id,alt) VALUES($1,1,$2,'personal')",
        [post, personalMedia],
      );
      await query(
        "INSERT INTO community_reposts(user_id,post_id) VALUES($1,$2)",
        [user, post],
      );
      await query(
        "INSERT INTO community_post_topics(post_id,topic_id) VALUES($1,$2)",
        [post, topic],
      );
      const routinePost = await communityPost(user);
      await query(
        `INSERT INTO community_routines(post_id,author_id,day,items,minutes)
         VALUES($1,$2,'2026-11-19','[]',0)`,
        [routinePost, user],
      );
      await query(
        "INSERT INTO community_blocks(blocker_id,blocked_id) VALUES($1,$2),($2,$1)",
        [user, other],
      );
      const reportId = randomUUID();
      await query(
        `INSERT INTO content_reports(id,reporter_id,target_type,target_id,reason,due_at,handled_by)
         VALUES($1,$2,'post',$3,'spam',now()+interval '1 day',$2)`,
        [reportId, user, post],
      );
      await query(
        `INSERT INTO content_restrictions(target_type,target_id,action,reason_code,actor_id,report_id,lifted_by)
         VALUES('post',$1,'hidden','spam',$2,$3,$2)`,
        [post, user, reportId],
      );
      await query(
        `INSERT INTO content_suspensions(user_id,reason_code,actor_id,ends_at)
         VALUES($1,'abuse',$2,now()+interval '1 day'),($2,'test',$1,now()+interval '1 day')`,
        [user, other],
      );

      const cleanupBefore = Number(
        (await query("SELECT count(*)::int AS count FROM media_cleanup_jobs"))
          .rows[0].count,
      );
      await query("DELETE FROM users WHERE id=$1", [user]);

      expect(
        Number(
          (
            await query(
              "SELECT count(*)::int AS count FROM media_objects WHERE owner_id=$1",
              [user],
            )
          ).rows[0].count,
        ),
      ).toBe(0);
      expect(
        (
          await query("SELECT created_by FROM media_objects WHERE id=$1", [
            contentMediaId,
          ])
        ).rows[0].created_by,
      ).toBeNull();
      for (const table of [
        "media_uploads",
        "media_renditions",
        "community_post_details",
        "community_post_media",
        "community_reposts",
        "community_post_topics",
        "community_routines",
        "community_blocks",
        "content_suspensions",
      ]) {
        const count = Number(
          (
            await query(
              `SELECT count(*)::int AS count FROM ${table} WHERE ${table === "media_uploads" || table === "media_renditions" ? "media_id" : table === "community_post_details" ? "post_id" : table === "community_post_media" ? "post_id" : table === "community_reposts" ? "user_id" : table === "community_post_topics" ? "post_id" : table === "community_routines" ? "author_id" : table === "community_blocks" ? "blocker_id" : "user_id"}=$1`,
              [
                table === "media_uploads" || table === "media_renditions"
                  ? personalMedia
                  : table === "community_post_details" ||
                      table === "community_post_media" ||
                      table === "community_post_topics"
                    ? post
                    : user,
              ],
            )
          ).rows[0].count,
        );
        expect(count, table).toBe(0);
      }
      expect(
        Number(
          (
            await query(
              "SELECT count(*)::int AS count FROM content_reports WHERE id=$1",
              [reportId],
            )
          ).rows[0].count,
        ),
      ).toBe(1);
      expect(
        (
          await query(
            "SELECT reporter_id,handled_by FROM content_reports WHERE id=$1",
            [reportId],
          )
        ).rows[0],
      ).toEqual({ reporter_id: null, handled_by: null });
      expect(
        (
          await query(
            "SELECT actor_id,lifted_by FROM content_restrictions WHERE target_id=$1",
            [post],
          )
        ).rows[0],
      ).toEqual({ actor_id: null, lifted_by: null });
      expect(
        Number(
          (await query("SELECT count(*)::int AS count FROM media_cleanup_jobs"))
            .rows[0].count,
        ),
      ).toBe(cleanupBefore);
    });
  },
);
