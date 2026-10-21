import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { pool } from "@workspace/db";
import { organizationAction } from "../artifacts/api-server/src/services/community-org-actions";
import { CommunityReader } from "../artifacts/api-server/src/services/community-reader";
import { notificationReadWhere } from "../artifacts/api-server/src/services/community-policy";
import {
  transaction,
  type AuthSession,
} from "../artifacts/api-server/src/services/auth-sessions";
import type { CommunityAction } from "../artifacts/api-server/src/services/community-input";

// Only the live provider lookup is replaced; policy, transactions and SQL are real.
const provider = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock(
  "../artifacts/api-server/src/services/auth-provider",
  async (original) => ({
    ...(await original<
      typeof import("../artifacts/api-server/src/services/auth-provider")
    >()),
    adminClient: () => ({ auth: { admin: { getUserById: provider.lookup } } }),
  }),
);

const sessionFor = (id: string) =>
  ({
    user: { id, platformRole: null },
    aal: "aal2",
    row: { last_mfa_at: new Date() },
    providerUser: { factors: [{ status: "verified", factor_type: "totp" }] },
  }) as AuthSession;

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Organization invitations require the invitee's consent",
  () => {
    let org: string, slug: string, owner: string, target: string;
    let handle: string;
    const run = async (actor: string, input: Record<string, unknown>) =>
      (await transaction((db) =>
        organizationAction(db, sessionFor(actor), input as CommunityAction),
      ))!;
    const invite = (role = "organization_member") =>
      run(owner, {
        action: "member-save",
        organizationId: org,
        handle,
        role,
      });
    const respond = (accept: boolean) =>
      run(target, { action: "member-respond", organizationId: org, accept });
    const liveSessions = async () =>
      (
        await pool.query(
          "SELECT id FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND encrypted_credentials IS NOT NULL",
          [target],
        )
      ).rows.length;
    const membership = async () =>
      (
        await pool.query(
          "SELECT r.key,m.status FROM organization_members m JOIN roles r ON r.id=m.role_id WHERE m.organization_id=$1 AND m.user_id=$2",
          [org, target],
        )
      ).rows[0] ?? null;
    const notifications = async () =>
      (
        await pool.query(
          "SELECT href FROM notifications WHERE user_id=$1 AND title='Organization invitation'",
          [target],
        )
      ).rows;
    beforeEach(async () => {
      org = randomUUID();
      slug = `invite-${org.slice(0, 8)}`;
      owner = randomUUID();
      target = randomUUID();
      handle = `invitee-${target.slice(0, 8)}`;
      provider.lookup.mockReset();
      provider.lookup.mockResolvedValue({
        data: {
          user: { factors: [{ status: "verified", factor_type: "totp" }] },
        },
        error: null,
      });
      await pool.query(
        "INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) ids(id)",
        [[owner, target]],
      );
      await pool.query(
        "INSERT INTO profiles(user_id,display_name,handle) VALUES($1,'Owner',$2),($3,'Invitee',$4)",
        [owner, `owner-${owner.slice(0, 8)}`, target, handle],
      );
      await pool.query(
        "INSERT INTO organizations(id,name,slug) VALUES($1,'Invitation fixture',$2)",
        [org, slug],
      );
      await pool.query(
        "INSERT INTO community_organization_profiles(organization_id,visibility) VALUES($1,'private')",
        [org],
      );
      await pool.query(
        "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key='organization_owner'",
        [org, owner],
      );
      await pool.query(
        "INSERT INTO sessions(user_id,provider_session_id,expires_at,encrypted_credentials) VALUES($1,$2,now()+interval '1 hour','fixture-credentials')",
        [target, randomUUID()],
      );
    });
    afterEach(async () => {
      await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
        [owner, target],
      ]);
    });
    afterAll(async () => {
      await pool.end();
    });

    it("invites instead of adding, notifies once, and leaves sessions alone", async () => {
      expect((await invite()).message).toMatch(/after accepting/);
      expect(await membership()).toBeNull();
      expect(await liveSessions()).toBe(1);
      expect((await invite("organization_admin")).message).toBe(
        "Pending invitation updated",
      );
      expect(await notifications()).toEqual([
        { href: `/organizations/${slug}` },
      ]);
      // The invitee can read it while the invitation is pending.
      const visible = await pool.query(
        `SELECT n.id FROM notifications n WHERE ${notificationReadWhere()} AND n.title='Organization invitation'`,
        [target],
      );
      expect(visible.rows).toHaveLength(1);
      await respond(false);
      expect(
        (
          await pool.query(
            `SELECT n.id FROM notifications n WHERE ${notificationReadWhere()} AND n.title='Organization invitation'`,
            [target],
          )
        ).rows,
      ).toHaveLength(0);
    });

    it("shows a private organization to the invitee and pending invitations to managers only", async () => {
      await invite("organization_admin");
      const [asInvitee] = await new CommunityReader(target).organizations(
        "o.id=$2",
        [org],
        0,
        true,
      );
      expect(asInvitee!.myRole).toBeNull();
      expect(asInvitee!.myInvitation).toMatchObject({
        role: "organization_admin",
      });
      expect(asInvitee!.members).toEqual([]);
      expect(asInvitee!.invitations).toEqual([]);
      const [asOwner] = await new CommunityReader(owner).organizations(
        "o.id=$2",
        [org],
        0,
        true,
      );
      expect(asOwner!.invitations.map((i) => i.person.id)).toEqual([target]);
      expect(
        await new CommunityReader(null).organizations("o.id=$2", [org]),
      ).toEqual([]);
    });

    it("joins with the invited role only when the invitee accepts", async () => {
      await invite("organization_admin");
      expect((await respond(true)).message).toBe("Invitation accepted");
      expect(await membership()).toEqual({
        key: "organization_admin",
        status: "active",
      });
      expect(await liveSessions()).toBe(1);
      expect(
        (
          await pool.query(
            "SELECT id FROM organization_invitations WHERE organization_id=$1",
            [org],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(respond(true)).rejects.toMatchObject({ status: 404 });
    });

    it("rechecks the invitee's MFA for a privileged role at acceptance", async () => {
      await invite("organization_owner");
      provider.lookup.mockResolvedValue({
        data: { user: { factors: [] } },
        error: null,
      });
      await expect(respond(true)).rejects.toMatchObject({
        code: "TARGET_MFA_REQUIRED",
      });
      expect(await membership()).toBeNull();
    });

    it("blocks re-sending a declined invitation for a week", async () => {
      await invite();
      expect((await respond(false)).message).toBe("Invitation declined");
      expect(await membership()).toBeNull();
      await expect(invite()).rejects.toMatchObject({
        code: "INVITATION_DECLINED",
      });
      await pool.query(
        "UPDATE organization_invitations SET declined_at=now()-interval '8 days',created_at=now()-interval '9 days' WHERE organization_id=$1",
        [org],
      );
      await pool.query(
        "UPDATE notifications SET created_at=now()-interval '9 days' WHERE user_id=$1",
        [target],
      );
      await invite();
      expect(await notifications()).toHaveLength(2);
    });

    it("refuses an expired invitation", async () => {
      await invite();
      await pool.query(
        "UPDATE organization_invitations SET expires_at=now()-interval '1 minute' WHERE organization_id=$1",
        [org],
      );
      await expect(respond(true)).rejects.toMatchObject({ status: 404 });
      expect(await membership()).toBeNull();
    });

    it("cannot be used to force someone into an organization or keep signing them out", async () => {
      for (let i = 0; i < 5; i++) {
        await invite();
        expect(
          (
            await run(owner, {
              action: "member-remove",
              organizationId: org,
              targetId: target,
            })
          ).message,
        ).toBe("Invitation cancelled");
      }
      expect(await membership()).toBeNull();
      expect(await liveSessions()).toBe(1);
      // Re-inviting within a day reopens the invitation without a new notification.
      expect(await notifications()).toHaveLength(1);
      await expect(respond(true)).rejects.toMatchObject({ status: 404 });
    });

    it("signs out a member when they are removed", async () => {
      await invite();
      await respond(true);
      await run(owner, {
        action: "member-remove",
        organizationId: org,
        targetId: target,
      });
      expect(await membership()).toEqual({
        key: "organization_member",
        status: "inactive",
      });
      expect(await liveSessions()).toBe(0);
    });
  },
);
