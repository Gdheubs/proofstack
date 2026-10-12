import { projectAction } from "../artifacts/api-server/src/services/community-project-actions";
import { organizationAction } from "../artifacts/api-server/src/services/community-org-actions";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import {
  postReadWhere,
  assertNoHiddenLinkedPosts,
  projectReadWhere,
} from "../artifacts/api-server/src/services/community-policy";
import {
  ownedPost,
  visiblePost,
} from "../artifacts/api-server/src/services/community-social-actions";

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Community visibility transitions",
  () => {
    afterAll(async () => {
      await pool.end();
    });
    it("hides private-project posts, preserves author management, and denies other tenants", async () => {
      const db = await pool.connect();
      const org = randomUUID();
      const owner = randomUUID(),
        other = randomUUID(),
        project = randomUUID(),
        post = randomUUID();
      try {
        await db.query("BEGIN");
        await db.query(
          "INSERT INTO users(id,auth_subject,email) VALUES($1::uuid,$1::text,$2),($3::uuid,$3::text,$4)",
          [owner, `${owner}@example.test`, other, `${other}@example.test`],
        );
        await db.query(
          "INSERT INTO community_projects(id,owner_id,slug,title,description) VALUES($1::uuid,$2,$1::text,'Fixture','Fixture')",
          [project, owner],
        );
        await db.query(
          "INSERT INTO community_posts(id,author_id,project_id,body) VALUES($1,$2,$3,'Fixture')",
          [post, owner, project],
        );
        await db.query(
          "INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Fixture',$1::text)",
          [org],
        );
        await db.query(
          "INSERT INTO community_organization_profiles(organization_id,visibility) VALUES($1,'public')",
          [org],
        );
        await db.query(
          "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key='organization_owner'",
          [org, owner],
        );
        await db.query(
          "UPDATE community_projects SET organization_id=$1 WHERE id=$2",
          [org, project],
        );
        expect((await visiblePost(db, post)).id).toBe(post);
        await expect(
          assertNoHiddenLinkedPosts(db, [project]),
        ).resolves.toBeUndefined();
        await db.query(
          "UPDATE community_organization_profiles SET visibility='private' WHERE organization_id=$1",
          [org],
        );
        expect(
          (
            await db.query(
              `SELECT p.id FROM community_posts p WHERE p.id=$1 AND ${postReadWhere()}`,
              [post],
            )
          ).rowCount,
        ).toBe(0);
        await expect(visiblePost(db, post)).rejects.toMatchObject({
          status: 404,
        });
        await expect(
          assertNoHiddenLinkedPosts(db, [project]),
        ).rejects.toMatchObject({ code: "HIDDEN_POSTS_LINKED" });
        const actor = {
          user: { id: owner },
          aal: "aal2",
          row: { last_mfa_at: new Date() },
          providerUser: {
            factors: [{ status: "verified", factor_type: "totp" }],
          },
        } as AuthSession;
        await expect(
          projectAction(db, actor, { action: "project-delete", id: project }),
        ).rejects.toMatchObject({ code: "HIDDEN_POSTS_LINKED" });
        await expect(
          organizationAction(db, actor, {
            action: "organization-delete",
            id: org,
          }),
        ).rejects.toMatchObject({ code: "HIDDEN_POSTS_LINKED" });
        await expect(
          organizationAction(db, actor, {
            action: "member-remove",
            organizationId: org,
            targetId: owner,
          }),
        ).rejects.toMatchObject({ code: "LAST_ORGANIZATION_OWNER" });
        expect((await ownedPost(db, post, owner)).id).toBe(post);
        await expect(ownedPost(db, post, other)).rejects.toMatchObject({
          status: 404,
        });
        for (const viewer of [null, other]) {
          expect(
            (
              await db.query(
                `SELECT p.id FROM community_projects p LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id WHERE p.id=$2 AND ${projectReadWhere()}`,
                [viewer, project],
              )
            ).rowCount,
          ).toBe(0);
        }
        expect(
          (
            await db.query(
              `SELECT p.id FROM community_projects p LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id WHERE p.id=$2 AND ${projectReadWhere()}`,
              [owner, project],
            )
          ).rowCount,
        ).toBe(1);
      } finally {
        await db.query("ROLLBACK");
        db.release();
      }
    });
  },
);
