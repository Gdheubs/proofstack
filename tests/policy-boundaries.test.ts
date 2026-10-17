import { beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import {
  authActionSchema,
  firebaseSessionSchema,
} from "../artifacts/api-server/src/services/auth-input";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
import {
  authorizeOrg,
  authorizeProject,
  orgPermission,
  orgRole,
  requireCommunityProfile,
  handleUser,
  notify,
  recordActivity,
  assertNoHiddenLinkedPosts,
  type CommunityDb,
} from "../artifacts/api-server/src/services/community-policy";
import {
  proofBatch,
  proofs,
  validateProofs,
  proofIds,
} from "../artifacts/api-server/src/services/careers-policy";
import {
  pullHeads,
  eligibleReviews,
  checkStatus,
} from "../artifacts/api-server/src/services/pull-policy";

vi.mock("@workspace/db", () => ({ pool: { query: vi.fn() } }));
const uid = "6bda5322-fd44-4ce9-8ed4-ce07feee14d1";
const other = "6bda5322-fd44-4ce9-8ed4-ce07feee14d2";
const id = "6bda5322-fd44-4ce9-8ed4-ce07feee14d3";
const fresh = (aal = "aal2") =>
  ({
    user: { id: uid },
    aal,
    row: { last_mfa_at: new Date() },
    providerUser: {
      factors: [{ id, status: "verified", factor_type: "totp" }],
    },
  }) as AuthSession;
const result = (rows: object[] = []) => ({ rows });
const client = (rows: object[] = []) => {
  const query = vi.fn().mockResolvedValue(result(rows));
  return { query, db: { query } as unknown as CommunityDb };
};
beforeEach(() => vi.clearAllMocks());

// These unit fakes exercise decision/control flow and bound query inputs.
// Native SQL/HTTP tenant tests remain a separate mandatory verification gate.
describe("strict identity inputs", () => {
  it("normalizes contact input and validates the token transport, not token authenticity", () => {
    expect(
      authActionSchema.parse({
        action: "password-reset",
        email: "DEV@EXAMPLE.TEST",
      }),
    ).toEqual({ action: "password-reset", email: "dev@example.test" });
    expect(
      firebaseSessionSchema.parse({ idToken: "unit-only.jwt.transport" })
        .idToken,
    ).toBe("unit-only.jwt.transport");
  });
  it.each([
    " unit.token",
    "unit.token ",
    "unit token",
    "unit\ttoken",
    "",
    "x".repeat(16385),
  ])("rejects malformed token transport %#", (idToken) => {
    expect(firebaseSessionSchema.safeParse({ idToken }).success).toBe(false);
  });
});

describe("organization grant and assurance decisions", () => {
  function organization(
    role: string | null = "organization_owner",
    grant = true,
    exists = true,
    readGrant = true,
  ) {
    const query = vi.fn(async (sql: string, values: unknown[]) => {
      if (sql.startsWith("SELECT id FROM organizations"))
        return result(exists ? [{ id }] : []);
      if (sql.startsWith("SELECT r.key"))
        return result(role ? [{ key: role }] : []);
      if (sql.includes("SELECT 1 AS allowed"))
        return result(
          (values[2] === "community.organization.read" ? readGrant : grant)
            ? [{ allowed: 1 }]
            : [],
        );
      throw new Error("Unexpected policy query");
    });
    return { query, db: { query } as unknown as CommunityDb };
  }
  it("does not query for anonymous/empty-organization lookups", async () => {
    const { db, query } = organization();
    expect(
      await orgPermission(id, null, "community.organization.read", db),
    ).toBe(false);
    expect(await orgRole(id, null, db)).toBeNull();
    expect(await orgRole("", uid, db)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
  it("requires a real read grant before looking up a role", async () => {
    const { db, query } = organization("organization_owner", true, true, false);
    expect(await orgRole(id, uid, db)).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([
      uid,
      id,
      "community.organization.read",
    ]);
    expect(await orgRole(id, uid, organization(null).db)).toBeNull();
  });
  it("does not reveal a missing organization", async () => {
    await expect(
      authorizeOrg(organization(null, false, false).db, fresh(), id, "member"),
    ).rejects.toMatchObject({ status: 404 });
  });
  it.each([
    ["organization_member", "member", true],
    ["organization_member", "manage", false],
    ["organization_admin", "owner", false],
    ["organization_admin", "manage", true],
    ["organization_owner", "owner", true],
    [null, "member", false],
  ] as const)(
    "applies %s at %s without role-name escalation",
    async (role, level, allowed) => {
      const operation = authorizeOrg(organization(role).db, fresh(), id, level);
      if (allowed) await expect(operation).resolves.toBe(role);
      else await expect(operation).rejects.toMatchObject({ status: 403 });
    },
  );
  it("requires both fresh native MFA and the requested management grant", async () => {
    await expect(
      authorizeOrg(organization().db, fresh("aal1"), id, "manage"),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    await expect(
      authorizeOrg(
        organization("organization_owner", false).db,
        fresh(),
        id,
        "owner",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("project write decisions", () => {
  function project(
    owner: string,
    role: string | null,
    contributor: boolean,
    management = true,
    exists = true,
    organized = true,
  ) {
    const row = { id, owner_id: owner, organization_id: organized ? id : null };
    const query = vi.fn(async (sql: string, values: unknown[]) => {
      if (sql.startsWith("SELECT p.*")) return result(exists ? [row] : []);
      if (sql.startsWith("SELECT r.key"))
        return result(role ? [{ key: role }] : []);
      if (sql.includes("SELECT 1 AS allowed"))
        return result(
          (values[2] === "community.organization.read" || management) && role
            ? [{ allowed: 1 }]
            : [],
        );
      if (sql.includes("FROM community_contributors"))
        return result(contributor ? [{ present: 1 }] : []);
      throw new Error("Unexpected policy query");
    });
    return { query, db: { query } as unknown as CommunityDb, row };
  }
  it("uses a locked, bound project read and rejects a missing project", async () => {
    const { db, query } = project(uid, null, false, false, false);
    await expect(
      authorizeProject(db, fresh(), id, "read"),
    ).rejects.toMatchObject({ status: 404 });
    expect(query.mock.calls[0][1]).toEqual([uid, id]);
    expect(query.mock.calls[0][0]).toContain("FOR UPDATE OF p");
  });
  it.each([
    [uid, null, false, "edit", true, false],
    [other, null, false, "edit", false, false],
    [other, null, true, "contribute", true, false],
    [other, null, false, "contribute", false, false],
    [uid, null, false, "edit", false, true],
    [other, null, false, "read", true, true],
    [other, "organization_member", true, "contribute", true, true],
    [other, "organization_member", true, "edit", false, true],
    [other, "organization_admin", false, "edit", true, true],
    [other, "organization_owner", false, "contribute", true, true],
  ] as const)(
    "does not confuse ownership, contribution and organization grants (%#)",
    async (owner, role, contributor, level, allowed, organized) => {
      const fixture = project(owner, role, contributor, true, true, organized);
      const operation = authorizeProject(fixture.db, fresh(), id, level);
      if (allowed) await expect(operation).resolves.toEqual(fixture.row);
      else await expect(operation).rejects.toMatchObject({ status: 403 });
    },
  );
  it("requires management grant and fresh native MFA for non-owner manager writes", async () => {
    await expect(
      authorizeProject(
        project(other, "organization_admin", false, false).db,
        fresh(),
        id,
        "edit",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      authorizeProject(
        project(other, "organization_admin", false).db,
        fresh("aal1"),
        id,
        "edit",
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });
});

describe("profile, event and hidden-reference guards", () => {
  it("requires an existing public profile and active handle match", async () => {
    await expect(
      requireCommunityProfile(uid, client().db),
    ).rejects.toMatchObject({ code: "COMMUNITY_PROFILE_REQUIRED" });
    await expect(handleUser("missing", client().db)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      await requireCommunityProfile(
        uid,
        client([{ handle: "builder", display_name: "Builder" }]).db,
      ),
    ).toEqual({ handle: "builder", display_name: "Builder" });
    expect(await handleUser("builder", client([{ id: uid }]).db)).toBe(uid);
  });
  it("does not self-notify; binds and bounds external notification fields", async () => {
    const { db, query } = client();
    await notify(db, uid, uid, "self", "self", "/");
    expect(query).not.toHaveBeenCalled();
    await notify(
      db,
      uid,
      other,
      "t".repeat(250),
      "b".repeat(1100),
      "/projects/project",
    );
    expect(query.mock.calls[0][1]).toEqual([
      uid,
      "t".repeat(200),
      "b".repeat(1000),
      "/projects/project",
    ]);
    await recordActivity(
      db,
      uid,
      "project-created",
      "Project",
      "/projects/project",
      id,
      id,
    );
    expect(query.mock.calls[1][1]).toEqual([
      uid,
      id,
      "community.project-created",
      JSON.stringify({
        title: "Project",
        href: "/projects/project",
        resourceId: id,
      }),
    ]);
    await recordActivity(db, uid, "profile-updated", "Profile", "/profile", id);
    expect(query.mock.calls[2][1][1]).toBeNull();
  });
  it("does not publish hidden linked posts as a side effect of a parent cascade", async () => {
    const empty = client();
    await assertNoHiddenLinkedPosts(empty.db, []);
    expect(empty.query).not.toHaveBeenCalled();
    await expect(
      assertNoHiddenLinkedPosts(empty.db, [id]),
    ).resolves.toBeUndefined();
    expect(empty.query.mock.calls[0][1]).toEqual([[id]]);
    await expect(
      assertNoHiddenLinkedPosts(client([{ id }]).db, [id]),
    ).rejects.toMatchObject({ code: "HIDDEN_POSTS_LINKED" });
  });
});

describe("career evidence scoping and batching", () => {
  it("retains public owner/contributor filters and explicit UUID bindings", async () => {
    const { db, query } = client([{ id }]);
    expect(await proofs(uid, undefined, db)).toEqual([{ id }]);
    expect(query.mock.calls[0][1]).toEqual([uid, null]);
    expect(query.mock.calls[0][0]).toContain("p.visibility='public'");
    await expect(validateProofs(uid, [id], db)).resolves.toBeUndefined();
    expect(query.mock.calls[1][1]).toEqual([uid, [id]]);
    await expect(validateProofs(uid, [id, other], db)).rejects.toMatchObject({
      code: "CAREER_INPUT_INVALID",
    });
    expect(proofIds.safeParse([id, id]).success).toBe(false);
    expect(proofIds.safeParse([id]).success).toBe(true);
  });
  it("batches evidence once and groups multiple results without N+1 lookups", async () => {
    expect((await proofBatch([])).size).toBe(0);
    const query = vi.mocked(pool.query);
    query.mockResolvedValueOnce({
      rows: [
        { key: "a", id },
        { key: "a", id: other },
        { key: "b", id },
      ],
    } as never);
    const wanted = [
      { key: "a", uid, ids: [id, other] },
      { key: "b", uid: other, ids: [id] },
    ];
    const batched = await proofBatch(wanted);
    expect(batched.get("a")).toEqual([{ id }, { id: other }]);
    expect(batched.get("b")).toEqual([{ id }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([JSON.stringify(wanted)]);
  });
});

describe("pull review and head policy", () => {
  const pr = {
    repository_id: id,
    source_branch: "feature",
    target_branch: "main",
    source_head: "source",
    target_head: "target",
    status: "open",
  };
  it.each(["closed", "merged"])(
    "uses immutable review snapshots after %s",
    async (status) => {
      const { db, query } = client();
      expect(await pullHeads(db, { ...pr, status })).toEqual({
        source: "source",
        target: "target",
      });
      expect(query).not.toHaveBeenCalled();
    },
  );
  it("requires both current branches while open", async () => {
    const { db, query } = client([
      { name: "main", head: "new-target" },
      { name: "feature", head: "new-source" },
    ]);
    expect(await pullHeads(db, pr)).toEqual({
      source: "new-source",
      target: "new-target",
    });
    expect(query.mock.calls[0][1]).toEqual([id, ["feature", "main"]]);
    await expect(
      pullHeads(client([{ name: "main", head: "target" }]).db, pr),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      pullHeads(client([{ name: "feature", head: "source" }]).db, pr),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("counts only the eligible current-head review result and reports vetoes", async () => {
    const { db, query } = client([
      { id: "one", decision: "approved" },
      { id: "two", decision: "changes-requested" },
      { id: "three", decision: "commented" },
    ]);
    expect(await eligibleReviews(db, id, other, "source", "target")).toEqual({
      reviewIds: ["one", "two", "three"],
      approvals: 1,
      changesRequested: true,
    });
    expect(query.mock.calls[0][1]).toEqual([id, other, "source", "target"]);
    expect(query.mock.calls[0][0]).toContain("DISTINCT ON(reviewer_id)");
    expect(
      await eligibleReviews(client().db, id, other, "source", "target"),
    ).toEqual({ reviewIds: [], approvals: 0, changesRequested: false });
  });
  it("does not reuse a check for unrelated heads", async () => {
    expect(await checkStatus(client().db, id, "source", "target")).toEqual({
      status: "pending",
      details: "Run the built-in patch check for these commits.",
      createdAt: "",
    });
    const { db, query } = client([
      { status: "passed", details: "checked", createdAt: "fixture" },
    ]);
    expect(await checkStatus(db, id, "source", "target")).toEqual({
      status: "passed",
      details: "checked",
      createdAt: "fixture",
    });
    expect(query.mock.calls[0][1]).toEqual([id, "source", "target"]);
  });
});
