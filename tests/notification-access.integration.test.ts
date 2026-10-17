import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { getCommunity } from "../artifacts/api-server/src/services/community-query";
import { runCommunityAction } from "../artifacts/api-server/src/services/community-actions";
import { notify } from "../artifacts/api-server/src/services/community-policy";
import { socialAction } from "../artifacts/api-server/src/services/community-social-actions";
import { projectAction } from "../artifacts/api-server/src/services/community-project-actions";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";

// Run with vitest.embedded.config.ts: tracked migrations, disposable PGlite SQL.
// No HTTP authentication/provider or application policy is mocked.
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "notification current access",
  () => {
    let owner: string,
      recipient: string,
      org: string,
      project: string,
      pull: string;
    const session = (id: string) => ({ user: { id } }) as AuthSession;
    const req = () => ({ id: randomUUID() }) as Request;
    const inbox = (id = recipient) =>
      getCommunity({ view: "notifications" }, id);
    const read = (id?: string, user = recipient) =>
      runCommunityAction(req(), session(user), {
        action: "notification-read",
        ...(id ? { id } : {}),
      });
    async function storedRead(id: string) {
      return (
        await pool.query("SELECT read_at FROM notifications WHERE id=$1", [id])
      ).rows[0].read_at;
    }
    async function storedNotice(
      title: string,
      body: string,
      href: string,
      organizationId: string | null = null,
    ) {
      return (
        await pool.query(
          "INSERT INTO notifications(user_id,organization_id,title,body,href) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [recipient, organizationId, title, body, href],
        )
      ).rows[0].id as string;
    }
    async function pullNotice() {
      await notify(
        pool,
        recipient,
        owner,
        "Pull request updated",
        "Secret pull title: review",
        `/pulls/${pull}`,
      );
      return (
        await pool.query("SELECT id FROM notifications WHERE user_id=$1", [
          recipient,
        ])
      ).rows[0].id as string;
    }
    beforeEach(async () => {
      [owner, recipient, org, project, pull] = Array.from({ length: 5 }, () =>
        randomUUID(),
      );
      for (const id of [owner, recipient]) {
        await pool.query(
          "INSERT INTO users(id,auth_subject,email) VALUES($1::uuid,$1::text,$1::text||'@example.test')",
          [id],
        );
        await pool.query(
          "INSERT INTO profiles(user_id,display_name,handle) VALUES($1,'Fixture',$2)",
          [id, `u${id.replaceAll("-", "").slice(0, 25)}`],
        );
      }
      await pool.query(
        "INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Secret organization',$1::text)",
        [org],
      );
      await pool.query(
        "INSERT INTO community_organization_profiles(organization_id,visibility) VALUES($1,'private')",
        [org],
      );
      for (const id of [owner, recipient])
        await pool.query(
          "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key='organization_member'",
          [org, id],
        );
      await pool.query(
        "INSERT INTO community_projects(id,owner_id,organization_id,slug,title,description,visibility) VALUES($1::uuid,$2,$3,$1::text,'Secret project','Fixture','organization')",
        [project, owner, org],
      );
      const repo = (
        await pool.query(
          "INSERT INTO repositories(project_id) VALUES($1) RETURNING id",
          [project],
        )
      ).rows[0].id;
      await pool.query(
        "INSERT INTO repository_pull_requests(id,repository_id,number,author_id,title,source_branch,target_branch,source_head,target_head) VALUES($1,$2,1,$3,'Secret pull title','feature','main',$4,$4)",
        [pull, repo, recipient, "a".repeat(40)],
      );
    });
    afterEach(async () => {
      await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
        [owner, recipient],
      ]);
    });
    afterAll(async () => {
      await pool.end();
    });

    it("retains the existing known social, account, membership and applicant notification destinations", async () => {
      await pool.query(
        "UPDATE community_projects SET visibility='public' WHERE id=$1",
        [project],
      );
      await pool.query(
        "UPDATE community_organization_profiles SET visibility='public' WHERE organization_id=$1",
        [org],
      );
      const post = (
        await pool.query(
          "INSERT INTO community_posts(author_id,project_id,body) VALUES($1,$2,'Fixture') RETURNING id",
          [owner, project],
        )
      ).rows[0].id;
      const job = (
        await pool.query(
          "INSERT INTO career_jobs(organization_id,creator_id,title,description,kind,workplace) VALUES($1,$2,'Fixture','Fixture','job','remote') RETURNING id",
          [org, owner],
        )
      ).rows[0].id;
      const application = (
        await pool.query(
          "INSERT INTO career_applications(job_id,applicant_id,note) VALUES($1,$2,'Fixture') RETURNING id",
          [job, recipient],
        )
      ).rows[0].id;
      const handle = (
        await pool.query("SELECT handle FROM profiles WHERE user_id=$1", [
          owner,
        ])
      ).rows[0].handle;
      const cases: [string, string, string, string | null][] = [
        ["New follower", "Fixture followed you", `/profile/${handle}`, null],
        [
          "You were mentioned",
          "Fixture mentioned you in a post",
          `/posts/${post}`,
          null,
        ],
        ["New comment", "Fixture commented on a post", `/posts/${post}`, null],
        [
          "New reaction",
          "Fixture reacted to your comment",
          `/posts/${post}`,
          null,
        ],
        [
          "New reaction",
          "Fixture reacted to your project",
          `/projects/${project}`,
          null,
        ],
        [
          "Organization membership updated",
          "Your ProofStack organization membership was updated.",
          "/organizations",
          null,
        ],
        [
          "Organization access updated",
          "Your organization role is now organization member.",
          "/account",
          org,
        ],
        [
          "New device signed in",
          "Fixture signed in. Review your active sessions if this was not you.",
          "/account",
          null,
        ],
        [
          "MFA account recovery",
          "Your security factors were reset using a recovery code. All sessions are revoked. Sign in and enroll a new factor.",
          "/account",
          null,
        ],
        [
          "Application updated",
          "Your application is now reviewing.",
          `/applications/${application}`,
          null,
        ],
        [
          "Application message",
          "A hiring team sent you a message.",
          `/applications/${application}`,
          null,
        ],
      ];
      const ids = [];
      for (const entry of cases) ids.push(await storedNotice(...entry));
      const result = await inbox();
      expect(result.notifications.map((n) => n.id).sort()).toEqual(ids.sort());
      expect(result.unreadCount).toBe(cases.length);
      for (const [title, body, href] of cases)
        expect(result.notifications).toContainEqual(
          expect.objectContaining({ title, body, href }),
        );
      await read();
      expect((await inbox()).unreadCount).toBe(0);
      expect((await inbox()).notifications.every((n) => n.read)).toBe(true);
    });

    it.each([
      "owner-disabled",
      "project-deleted",
      "organization-deleted",
      "project-private",
      "organization-private",
    ])("hides stored project and pull metadata when %s", async (change) => {
      if (change.endsWith("private")) {
        await pool.query(
          "UPDATE community_projects SET visibility='public' WHERE id=$1",
          [project],
        );
        await pool.query(
          "UPDATE community_organization_profiles SET visibility='public' WHERE organization_id=$1",
          [org],
        );
        await pool.query("DELETE FROM organization_members WHERE user_id=$1", [
          recipient,
        ]);
      }
      await pool.query(
        "INSERT INTO community_contributors(project_id,user_id) VALUES($1,$2)",
        [project, recipient],
      );
      const pullId = await pullNotice();
      await notify(
        pool,
        recipient,
        owner,
        "Project contributor invitation",
        "You were invited to contribute to Secret project. Accept or decline on the project page.",
        `/projects/${project}`,
      );
      const before = await inbox();
      expect(before.notifications).toHaveLength(2);
      expect(before.unreadCount).toBe(2);
      if (change === "owner-disabled")
        await pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
          owner,
        ]);
      else if (change === "project-deleted")
        await pool.query("DELETE FROM community_projects WHERE id=$1", [
          project,
        ]);
      else if (change === "organization-deleted")
        await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
      else if (change === "project-private")
        await pool.query(
          "UPDATE community_projects SET visibility='organization' WHERE id=$1",
          [project],
        );
      else
        await pool.query(
          "UPDATE community_organization_profiles SET visibility='private' WHERE organization_id=$1",
          [org],
        );
      expect((await inbox()).notifications).toEqual([]);
      expect((await inbox()).unreadCount).toBe(0);
      await read();
      for (const notice of before.notifications)
        expect(await storedRead(notice.id)).toBeNull();
      expect(
        (
          await pool.query("SELECT body,href FROM notifications WHERE id=$1", [
            pullId,
          ])
        ).rows[0],
      ).toEqual({ body: "Secret pull title: review", href: `/pulls/${pull}` });
    });

    it("uses live read grants, not only active organization membership or role names", async () => {
      const id = await pullNotice();
      const role = randomUUID();
      await pool.query(
        "INSERT INTO roles(id,key,name) VALUES($1,$2,'Fixture')",
        [role, `notification_${role}`],
      );
      try {
        await pool.query(
          "INSERT INTO role_permissions(role_id,permission_id) SELECT $1,id FROM permissions WHERE key='community.organization.read'",
          [role],
        );
        await pool.query(
          "UPDATE organization_members SET role_id=$1 WHERE organization_id=$2 AND user_id=$3",
          [role, org, recipient],
        );
        expect((await inbox()).notifications.map((n) => n.id)).toEqual([id]);
        await pool.query("DELETE FROM role_permissions WHERE role_id=$1", [
          role,
        ]);
        expect((await inbox()).notifications).toEqual([]);
        expect((await inbox()).unreadCount).toBe(0);
        await read(id);
        expect(await storedRead(id)).toBeNull();
      } finally {
        await pool.query(
          "UPDATE organization_members SET role_id=(SELECT id FROM roles WHERE key='organization_member') WHERE role_id=$1",
          [role],
        );
        await pool.query("DELETE FROM roles WHERE id=$1", [role]);
      }
    });

    it("hides a deleted pull without hiding an unrelated still-accessible notification", async () => {
      const id = await pullNotice();
      const safe = await storedNotice(
        "New device signed in",
        "Fixture device signed in.",
        "/account",
      );
      await pool.query("DELETE FROM repository_pull_requests WHERE id=$1", [
        pull,
      ]);
      expect((await inbox()).notifications.map((n) => n.id)).toEqual([safe]);
      expect((await inbox()).unreadCount).toBe(1);
      await read();
      expect(await storedRead(id)).toBeNull();
      expect(await storedRead(safe)).toBeInstanceOf(Date);
    });

    it("keeps individual and bulk read mutations recipient-only", async () => {
      const id = await pullNotice();
      expect((await inbox(owner)).notifications).toEqual([]);
      expect((await inbox(owner)).unreadCount).toBe(0);
      await read(id, owner);
      await read(undefined, owner);
      expect(await storedRead(id)).toBeNull();
      await read(id);
      expect(await storedRead(id)).toBeInstanceOf(Date);
      expect((await inbox()).notifications[0].read).toBe(true);
      expect((await inbox()).unreadCount).toBe(0);
    });

    it("fails closed for unknown, malformed and ambiguous legacy destinations without rewriting snapshots", async () => {
      const cases = [
        ["Unknown legacy private title", "/account"],
        ["Unknown legacy private title", `/pulls/${pull}`],
        ["Pull request updated", `/pulls/${pull}?source=private`],
        ["Pull request updated", `/pulls/${pull}#private`],
        ["Pull request updated", `/pulls/${pull}/`],
        ["Pull request updated", `/pulls/${pull.toUpperCase()}`],
        ["Pull request updated", `/pulls/not-a-uuid`],
        ["Pull request updated", `https://example.test/pulls/${pull}`],
        ["Pull request updated", `//example.test/pulls/${pull}`],
        ["Project contributor invitation", `/projects/${project}?other=1`],
        ["Project contributor invitation", `/projects/%73ecret`],
        ["Organization membership updated", "/organizations"],
        ["Organization access updated", "/account"],
      ];
      const ids = [];
      for (const [title, href] of cases)
        ids.push(
          await storedNotice(title, "Secret legacy project title", href),
        );
      expect((await inbox()).notifications).toEqual([]);
      expect((await inbox()).unreadCount).toBe(0);
      await read();
      const stored = (
        await pool.query(
          "SELECT id,body,read_at FROM notifications WHERE user_id=$1",
          [recipient],
        )
      ).rows;
      expect(stored).toHaveLength(cases.length);
      expect(
        stored.every(
          (n) => n.body === "Secret legacy project title" && n.read_at === null,
        ),
      ).toBe(true);
      expect(stored.map((n) => n.id).sort()).toEqual(ids.sort());
    });

    it.each(["expired", "inactive", "revoked"])(
      "does not treat a %s contributor invitation as current",
      async (status) => {
        await pool.query(
          "INSERT INTO community_contributors(project_id,user_id) VALUES($1,$2)",
          [project, recipient],
        );
        const id = await storedNotice(
          "Project contributor invitation",
          "You were invited to contribute to Secret project. Accept or decline on the project page.",
          `/projects/${project}`,
        );
        expect((await inbox()).notifications.map((n) => n.id)).toEqual([id]);
        await pool.query(
          "UPDATE community_contributors SET status=$1 WHERE project_id=$2 AND user_id=$3",
          [status, project, recipient],
        );
        expect((await inbox()).notifications).toEqual([]);
        expect((await inbox()).unreadCount).toBe(0);
        await read(id);
        expect(await storedRead(id)).toBeNull();
      },
    );

    it("filters before pagination and counts only visible unread rows", async () => {
      const id = await pullNotice();
      const safe = await storedNotice(
        "New device signed in",
        "Fixture signed in.",
        "/account",
      );
      await pool.query(
        "INSERT INTO notifications(user_id,title,body,href) SELECT $1,'Unknown private legacy record','Secret project','/legacy' FROM generate_series(1,25)",
        [recipient],
      );
      const first = await inbox();
      expect(first.notifications.map((n) => n.id).sort()).toEqual(
        [id, safe].sort(),
      );
      expect(first.hasMore).toBe(false);
      expect(first.unreadCount).toBe(2);
      const next = await getCommunity(
        { view: "notifications", offset: 1 },
        recipient,
      );
      expect(next.notifications).toHaveLength(1);
      expect(next.hasMore).toBe(false);
      expect(next.unreadCount).toBe(2);
      await read(safe);
      expect((await inbox()).unreadCount).toBe(1);
      await read();
      expect((await inbox()).unreadCount).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL",
            [recipient],
          )
        ).rows[0].n,
      ).toBe(25);
    });

    it("hides mentions when a linked public project becomes private and refuses new outsider delivery", async () => {
      await pool.query(
        "UPDATE community_projects SET visibility='public' WHERE id=$1",
        [project],
      );
      await pool.query(
        "UPDATE community_organization_profiles SET visibility='public' WHERE organization_id=$1",
        [org],
      );
      await pool.query("DELETE FROM organization_members WHERE user_id=$1", [
        recipient,
      ]);
      const handle = (
        await pool.query("SELECT handle FROM profiles WHERE user_id=$1", [
          recipient,
        ])
      ).rows[0].handle;
      const created = await socialAction(
        pool,
        session(owner),
        {
          action: "post-save",
          body: `Hello @${handle}`,
          tags: [],
          projectId: project,
        },
        { handle: "fixture", display_name: "Fixture" },
      );
      expect(created).toHaveProperty("id");
      const before = await inbox();
      expect(before.notifications).toHaveLength(1);
      expect(before.notifications[0].title).toBe("You were mentioned");
      await pool.query(
        "UPDATE community_projects SET visibility='organization' WHERE id=$1",
        [project],
      );
      expect((await inbox()).notifications).toEqual([]);
      expect((await inbox()).unreadCount).toBe(0);
      await notify(
        pool,
        recipient,
        owner,
        "You were mentioned",
        "Another private mention",
        before.notifications[0].href,
      );
      expect(
        (
          await pool.query("SELECT id FROM notifications WHERE user_id=$1", [
            recipient,
          ])
        ).rows,
      ).toHaveLength(1);
      await read();
      expect(await storedRead(before.notifications[0].id)).toBeNull();
    });

    it("requires an active recipient even for otherwise-readable private work", async () => {
      const id = await pullNotice();
      await pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
        recipient,
      ]);
      expect((await inbox()).notifications).toEqual([]);
      expect((await inbox()).unreadCount).toBe(0);
      await read();
      expect(await storedRead(id)).toBeNull();
    });

    it.each(["membership-revoked", "organization-deleted"])(
      "hides organization-scoped account notices after %s",
      async (change) => {
        const id = await storedNotice(
          "Organization access updated",
          "Your organization role is now organization member.",
          "/account",
          org,
        );
        expect((await inbox()).notifications.map((n) => n.id)).toEqual([id]);
        if (change === "membership-revoked")
          await pool.query(
            "DELETE FROM organization_members WHERE user_id=$1",
            [recipient],
          );
        else await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
        expect((await inbox()).notifications).toEqual([]);
        expect((await inbox()).unreadCount).toBe(0);
        await read(id);
        expect(await storedRead(id)).toBeNull();
      },
    );

    it("hides a declined pending invitation while preserving the original snapshot", async () => {
      await pool.query(
        "INSERT INTO community_contributors(project_id,user_id) VALUES($1,$2)",
        [project, recipient],
      );
      const id = await storedNotice(
        "Project contributor invitation",
        "You were invited to contribute to Secret project. Accept or decline on the project page.",
        `/projects/${project}`,
      );
      expect((await inbox()).notifications.map((n) => n.id)).toEqual([id]);
      await projectAction(pool, session(recipient), {
        action: "contributor-respond",
        projectId: project,
        accept: false,
      });
      expect((await inbox()).notifications).toEqual([]);
      expect((await inbox()).unreadCount).toBe(0);
      await read();
      expect(await storedRead(id)).toBeNull();
    });

    it("does not disclose an old invitation title through a reassigned project slug", async () => {
      const replacement = randomUUID();
      await pool.query(
        "INSERT INTO community_projects(id,owner_id,slug,title,description) VALUES($1::uuid,$2,$1::text,'Different public project','Fixture')",
        [replacement, owner],
      );
      await pool.query(
        "INSERT INTO community_contributors(project_id,user_id) SELECT id,$2 FROM unnest($1::uuid[]) ids(id)",
        [[project, replacement], recipient],
      );
      const id = await storedNotice(
        "Project contributor invitation",
        "You were invited to contribute to Secret project. Accept or decline on the project page.",
        `/projects/${project}`,
      );
      expect((await inbox()).notifications.map((n) => n.id)).toEqual([id]);
      await pool.query(
        "UPDATE community_projects SET slug='renamed-'||id::text WHERE id=$1",
        [project],
      );
      await pool.query("UPDATE community_projects SET slug=$1 WHERE id=$2", [
        project,
        replacement,
      ]);
      await pool.query("DELETE FROM organization_members WHERE user_id=$1", [
        recipient,
      ]);
      expect((await inbox()).notifications).toEqual([]);
      expect((await inbox()).unreadCount).toBe(0);
      await read(id);
      expect(await storedRead(id)).toBeNull();
    });

    it("does not persist new private pull notifications for a revoked recipient", async () => {
      await pool.query("DELETE FROM organization_members WHERE user_id=$1", [
        recipient,
      ]);
      await notify(
        pool,
        recipient,
        owner,
        "Pull request updated",
        "Secret pull title: review",
        `/pulls/${pull}`,
      );
      expect(
        (
          await pool.query("SELECT id FROM notifications WHERE user_id=$1", [
            recipient,
          ])
        ).rows,
      ).toEqual([]);
    });

    it("delivers a fresh pending invitation after removal and re-invitation within the deduplication window", async () => {
      await pool.query(
        "UPDATE community_projects SET organization_id=NULL,visibility='public' WHERE id=$1",
        [project],
      );
      const handle = (
        await pool.query("SELECT handle FROM profiles WHERE user_id=$1", [
          recipient,
        ])
      ).rows[0].handle;
      await projectAction(pool, session(owner), {
        action: "contributor-invite",
        projectId: project,
        handle,
      });
      const old = (await inbox()).notifications[0];
      expect(old).toBeDefined();
      await projectAction(pool, session(owner), {
        action: "contributor-remove",
        projectId: project,
        targetId: recipient,
      });
      await projectAction(pool, session(owner), {
        action: "contributor-invite",
        projectId: project,
        handle,
      });
      const current = await inbox();
      expect(current.notifications).toHaveLength(1);
      expect(current.notifications[0].id).not.toBe(old.id);
      expect(current.unreadCount).toBe(1);
      await read();
      expect(await storedRead(old.id)).toBeNull();
      expect(await storedRead(current.notifications[0].id)).toBeInstanceOf(
        Date,
      );
    });

    it("preserves pending contributor invitations before contributor membership, then hides removed invitations", async () => {
      await pool.query(
        "UPDATE community_projects SET organization_id=NULL,visibility='public' WHERE id=$1",
        [project],
      );
      await pool.query("DELETE FROM organization_members WHERE user_id=$1", [
        recipient,
      ]);
      const handle = (
        await pool.query("SELECT handle FROM profiles WHERE user_id=$1", [
          recipient,
        ])
      ).rows[0].handle;
      await projectAction(pool, session(owner), {
        action: "contributor-invite",
        projectId: project,
        handle,
      });
      const pending = await inbox();
      expect(pending.notifications).toHaveLength(1);
      const notice = pending.notifications[0];
      expect(notice.body).toContain("Secret project");
      expect(notice.href).toBe(`/projects/${project}`);
      expect(pending.unreadCount).toBe(1);
      await projectAction(pool, session(recipient), {
        action: "contributor-respond",
        projectId: project,
        accept: true,
      });
      expect((await inbox()).notifications.map((n) => n.id)).toEqual([
        notice.id,
      ]);
      await projectAction(pool, session(owner), {
        action: "contributor-remove",
        projectId: project,
        targetId: recipient,
      });
      expect((await inbox()).notifications).toEqual([]);
      expect((await inbox()).unreadCount).toBe(0);
      await read(notice.id);
      expect(await storedRead(notice.id)).toBeNull();
    });

    it("withholds private pull snapshots and unread counts after recipient membership revocation", async () => {
      const id = await pullNotice();
      expect((await inbox()).notifications.map((n) => n.id)).toEqual([id]);
      expect((await inbox()).unreadCount).toBe(1);
      await pool.query(
        "UPDATE organization_members SET status='inactive' WHERE organization_id=$1 AND user_id=$2",
        [org, recipient],
      );
      const hidden = await inbox();
      expect(hidden.notifications).toEqual([]);
      expect(hidden.unreadCount).toBe(0);
      expect(
        (await getCommunity({ view: "feed" }, recipient)).unreadCount,
      ).toBe(0);
      await read(id);
      expect(await storedRead(id)).toBeNull();
      await read();
      expect(await storedRead(id)).toBeNull();
    });
  },
);
