import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import type { CommunityDb } from "../artifacts/api-server/src/services/community-policy";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
import { parseCommunityAction } from "../artifacts/api-server/src/services/community-input";
import { projectAction } from "../artifacts/api-server/src/services/community-project-actions";

function session(userId: string, fresh = true): AuthSession {
  return {
    user: { id: userId },
    aal: "aal2",
    row: { last_mfa_at: fresh ? new Date() : new Date(0) },
    providerUser: { factors: [{ status: "verified", factor_type: "totp" }] },
  } as AuthSession;
}

async function withFixture(
  run: (
    db: CommunityDb,
    fixture: {
      owner: string;
      admin: string;
      project: string;
      otherEntry: string;
      ownEntry: string;
    },
  ) => Promise<void>,
) {
  const db = await pool.connect();
  const owner = randomUUID();
  const admin = randomUUID();
  const organization = randomUUID();
  const project = randomUUID();
  const otherEntry = randomUUID();
  const ownEntry = randomUUID();
  try {
    await db.query("BEGIN");
    await db.query(
      "INSERT INTO users(id,auth_subject,email) VALUES($1::uuid,$1::text,$2),($3::uuid,$3::text,$4)",
      [owner, `${owner}@example.test`, admin, `${admin}@example.test`],
    );
    await db.query(
      "INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Fixture',$1::text)",
      [organization],
    );
    await db.query(
      "INSERT INTO community_organization_profiles(organization_id,visibility) VALUES($1,'private')",
      [organization],
    );
    for (const [userId, role] of [
      [owner, "organization_owner"],
      [admin, "organization_admin"],
    ]) {
      await db.query(
        "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key=$3",
        [organization, userId, role],
      );
    }
    await db.query(
      "INSERT INTO community_projects(id,owner_id,organization_id,slug,title,description,visibility) VALUES($1::uuid,$2,$3,$1::text,'Fixture','Fixture','organization')",
      [project, owner, organization],
    );
    await db.query(
      "INSERT INTO community_contributors(project_id,user_id,status) VALUES($1,$2,'active')",
      [project, admin],
    );
    await db.query(
      "INSERT INTO community_entries(id,user_id,project_id,kind,data) VALUES($1,$2,$3,'evidence',$4::jsonb),($5,$6,$3,'evidence',$4::jsonb)",
      [
        otherEntry,
        owner,
        project,
        JSON.stringify({ title: "Original" }),
        ownEntry,
        admin,
      ],
    );
    await run(db, { owner, admin, project, otherEntry, ownEntry });
  } finally {
    await db.query("ROLLBACK");
    db.release();
  }
}

async function revokeManage(db: CommunityDb) {
  await db.query(
    "DELETE FROM role_permissions WHERE role_id=(SELECT id FROM roles WHERE key='organization_admin') AND permission_id=(SELECT id FROM permissions WHERE key='community.organization.manage')",
  );
}

function editEntry(id: string, projectId: string) {
  return parseCommunityAction({
    action: "entry-save",
    id,
    projectId,
    kind: "evidence",
    title: "Updated",
  });
}

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Project entry permissions",
  () => {
    afterAll(async () => {
      await pool.end();
    });

    it("allows contributors without a management grant to edit and delete their own entries", async () => {
      await withFixture(async (db, f) => {
        await revokeManage(db);
        await expect(
          projectAction(db, session(f.admin), editEntry(f.ownEntry, f.project)),
        ).resolves.toMatchObject({ id: f.ownEntry });
        await expect(
          projectAction(
            db,
            session(f.admin),
            parseCommunityAction({ action: "entry-delete", id: f.ownEntry }),
          ),
        ).resolves.toMatchObject({ message: "Record deleted" });
      });
    });

    it("allows a fresh grant-authorized manager to edit and delete another contributor's entry", async () => {
      await withFixture(async (db, f) => {
        await expect(
          projectAction(
            db,
            session(f.admin),
            editEntry(f.otherEntry, f.project),
          ),
        ).resolves.toMatchObject({ id: f.otherEntry });
        await expect(
          projectAction(
            db,
            session(f.admin),
            parseCommunityAction({ action: "entry-delete", id: f.otherEntry }),
          ),
        ).resolves.toMatchObject({ message: "Record deleted" });
      });
    });

    it("denies an admin contributor without a manage grant deleting another author's record", async () => {
      await withFixture(async (db, f) => {
        await revokeManage(db);
        await expect(
          projectAction(
            db,
            session(f.admin),
            parseCommunityAction({ action: "entry-delete", id: f.otherEntry }),
          ),
        ).rejects.toMatchObject({
          status: 403,
          code: "COMMUNITY_PERMISSION_DENIED",
        });
        expect(
          (
            await db.query("SELECT id FROM community_entries WHERE id=$1", [
              f.otherEntry,
            ])
          ).rows,
        ).toHaveLength(1);
      });
    });

    it("denies an admin contributor without a manage grant editing another author's record", async () => {
      await withFixture(async (db, f) => {
        await revokeManage(db);
        await expect(
          projectAction(
            db,
            session(f.admin),
            editEntry(f.otherEntry, f.project),
          ),
        ).rejects.toMatchObject({
          status: 403,
          code: "COMMUNITY_PERMISSION_DENIED",
        });
        expect(
          (
            await db.query("SELECT data FROM community_entries WHERE id=$1", [
              f.otherEntry,
            ])
          ).rows[0].data.title,
        ).toBe("Original");
      });
    });
  },
);
