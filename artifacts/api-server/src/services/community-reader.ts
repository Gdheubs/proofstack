import { managerWhere } from "./careers-policy";
import { pool } from "@workspace/db";
import type {
  CommunityPerson,
  CommunityEntry,
  CommunityProject,
  CommunityPost,
  CommunityComment,
  CommunityReaction,
  CommunityOrganization,
} from "@workspace/api-zod";
import {
  orgRole,
  orgPermission,
  memberAccessWhere,
  projectReadWhere,
  postReadWhere,
  missing,
} from "./community-policy";

// An invited account may see the organization it was invited to, to respond.
const PENDING_INVITE = (org: string) =>
  `EXISTS(SELECT 1 FROM organization_invitations i WHERE i.organization_id=${org} AND i.user_id=$1::uuid AND i.declined_at IS NULL AND i.expires_at>now())`;

export class CommunityReader {
  private people = new Map<string, Promise<CommunityPerson | null>>();
  constructor(readonly uid: string | null) {}
  async preloadPeople(ids: string[]) {
    const pending = [...new Set(ids)].filter((id) => !this.people.has(id));
    if (!pending.length) return;
    const result = pool
      .query(
        `SELECT p.user_id AS id,coalesce(p.handle,'') AS handle,p.display_name AS "displayName",p.kind,coalesce(p.avatar_url,'') AS "avatarPath",p.bio,p.location,p.skills,p.headline,jsonb_build_object('website',coalesce(p.links->>'website',''),'github',coalesce(p.links->>'github',''),'linkedin',coalesce(p.links->>'linkedin','')) AS links,
      (SELECT count(*)::int FROM community_follows f JOIN users fu ON fu.id=f.follower_id AND fu.status='active' WHERE f.following_id=p.user_id) AS followers,
      (SELECT count(*)::int FROM community_follows f JOIN users fu ON fu.id=f.following_id AND fu.status='active' WHERE f.follower_id=p.user_id) AS following,
      EXISTS(SELECT 1 FROM community_follows f WHERE f.following_id=p.user_id AND f.follower_id=$2::uuid) AS "followingByMe",p.user_id=$2::uuid AS "isMe"
      FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=ANY($1::uuid[]) AND u.status='active'`,
        [pending, this.uid],
      )
      .then(
        (r) =>
          new Map<string, CommunityPerson>(
            r.rows.map((p) => [
              p.id,
              { ...p, isMe: !!p.isMe } as CommunityPerson,
            ]),
          ),
      );
    for (const id of pending) {
      const person = result.then((rows) => rows.get(id) ?? null);
      // A failed batch may be awaited before individual cache entries are consumed.
      void person.catch(() => {});
      this.people.set(id, person);
    }
    await result;
  }
  async person(uid: string): Promise<CommunityPerson | null> {
    await this.preloadPeople([uid]);
    return this.people.get(uid)!;
  }
  async entryRows(
    where: string,
    values: unknown[],
    canManage = false,
    allowOwn = true,
  ): Promise<CommunityEntry[]> {
    const r = await pool.query(
      `SELECT * FROM community_entries WHERE ${where} ORDER BY created_at DESC LIMIT 100`,
      values,
    );
    return r.rows.map(
      (e) =>
        ({
          ...e.data,
          id: e.id,
          kind: e.kind,
          sourceLabel: e.data.aiAssisted
            ? "AI-assisted"
            : e.data.url
              ? "Linked evidence"
              : "Self-reported",
          canEdit: canManage || (allowOwn && e.user_id === this.uid),
          createdAt: e.created_at.toISOString(),
        }) as CommunityEntry,
    );
  }
  async projects(
    where = "true",
    values: unknown[] = [],
    offset = 0,
  ): Promise<CommunityProject[]> {
    const editable = `((p.owner_id=$1::uuid AND (p.organization_id IS NULL OR ${memberAccessWhere("p.organization_id")})) OR ${managerWhere("p.organization_id", "$1")})`;
    const r = await pool.query(
      `SELECT p.*,coalesce(${editable},false) AS can_edit,
       coalesce((${editable} OR EXISTS(SELECT 1 FROM community_contributors c WHERE c.project_id=p.id AND c.user_id=$1 AND c.status='active')) AND (p.organization_id IS NULL OR ${memberAccessWhere("p.organization_id")}),false) AS can_contribute,
       EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.user_id=$1 AND b.target_type='project' AND b.target_id=p.id) AS bookmarked
       FROM community_projects p JOIN users owner_u ON owner_u.id=p.owner_id AND owner_u.status='active'
       LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id
       WHERE ${projectReadWhere()} AND (${where}) ORDER BY p.created_at DESC,p.id DESC LIMIT 21 OFFSET $${values.length + 2}`,
      [this.uid, ...values, offset],
    );
    if (!r.rows.length) return [];
    const ids = r.rows.map((p) => p.id);
    const [contributors, entries] = await Promise.all([
      pool.query(
        `SELECT c.* FROM unnest($1::uuid[]) requested(id) CROSS JOIN LATERAL (
        SELECT c.project_id,c.user_id,c.status FROM community_contributors c JOIN users u ON u.id=c.user_id AND u.status='active'
        WHERE c.project_id=requested.id ORDER BY c.created_at,c.user_id LIMIT 100) c`,
        [ids],
      ),
      pool.query(
        `SELECT e.* FROM unnest($1::uuid[]) requested(id) CROSS JOIN LATERAL (
        SELECT e.* FROM community_entries e WHERE e.project_id=requested.id ORDER BY e.created_at DESC,e.id DESC LIMIT 100) e`,
        [ids],
      ),
    ]);
    await this.preloadPeople([
      ...r.rows.map((p) => p.owner_id),
      ...contributors.rows.map((c) => c.user_id),
    ]);
    const contributorGroups = new Map<string, typeof contributors.rows>();
    const entryGroups = new Map<string, typeof entries.rows>();
    for (const c of contributors.rows) {
      const list = contributorGroups.get(c.project_id) ?? [];
      list.push(c);
      contributorGroups.set(c.project_id, list);
    }
    for (const e of entries.rows) {
      const list = entryGroups.get(e.project_id) ?? [];
      list.push(e);
      entryGroups.set(e.project_id, list);
    }
    return Promise.all(
      r.rows.map(async (p) => {
        // Pending invitations are visible only to project editors and the invitee.
        const visible = (contributorGroups.get(p.id) ?? []).filter(
          (c) => c.status === "active" || p.can_edit || c.user_id === this.uid,
        );
        const people = await Promise.all(
          visible.map(async (c) => ({
            person: await this.person(c.user_id),
            status: c.status,
          })),
        );
        return {
          id: p.id,
          slug: p.slug,
          title: p.title,
          description: p.description,
          technologies: p.technologies,
          screenshots: p.screenshots,
          demoUrl: p.demo_url,
          repositoryUrl: p.repository_url,
          visibility: p.visibility,
          organizationId: p.organization_id,
          owner: (await this.person(p.owner_id))!,
          contributors: people.filter(
            (c): c is { person: CommunityPerson; status: string } => !!c.person,
          ),
          canEdit: p.can_edit,
          canContribute: p.can_contribute,
          bookmarked: p.bookmarked,
          entries: (entryGroups.get(p.id) ?? []).map((e) => ({
            ...e.data,
            id: e.id,
            kind: e.kind,
            sourceLabel: e.data.aiAssisted
              ? "AI-assisted"
              : e.data.url
                ? "Linked evidence"
                : "Self-reported",
            canEdit: p.can_edit || (p.can_contribute && e.user_id === this.uid),
            createdAt: e.created_at.toISOString(),
          })),
          createdAt: p.created_at.toISOString(),
          updatedAt: p.updated_at.toISOString(),
        } as CommunityProject;
      }),
    );
  }
  async reactionBatch(type: string, ids: string[]) {
    if (!ids.length) return new Map<string, CommunityReaction[]>();
    const r = await pool.query(
      `SELECT r.target_id,r.kind,count(*)::int AS count,bool_or(r.user_id=$3::uuid) AS active FROM community_reactions r
       JOIN users u ON u.id=r.user_id AND u.status='active'
       WHERE r.target_type=$1 AND r.target_id=ANY($2::uuid[]) GROUP BY r.target_id,r.kind`,
      [type, ids, this.uid],
    );
    return new Map(
      ids.map((id) => [
        id,
        ["like", "insightful", "celebrate"].map((kind) => {
          const row = r.rows.find((r) => r.target_id === id && r.kind === kind);
          return {
            kind,
            count: row?.count ?? 0,
            active: !!row?.active,
          } as CommunityReaction;
        }),
      ]),
    );
  }
  async mentionPeople(ids: string[]): Promise<CommunityPerson[]> {
    await this.preloadPeople(ids.slice(0, 10));
    const people = await Promise.all(
      ids.slice(0, 10).map((id) => this.person(id)),
    );
    return people.filter((p): p is CommunityPerson => !!p && !!p.handle);
  }
  async commentsForPosts(postIds: string[], limit = 3, offset = 0) {
    if (!postIds.length) return new Map<string, CommunityComment[]>();
    const r = await pool.query(
      `SELECT c.* FROM unnest($1::uuid[]) AS requested(post_id)
       CROSS JOIN LATERAL (
         SELECT c.* FROM community_comments c JOIN users u ON u.id=c.author_id AND u.status='active'
         WHERE c.post_id=requested.post_id ORDER BY c.created_at ASC,c.id ASC LIMIT $3 OFFSET $2
       ) c ORDER BY c.post_id,c.created_at ASC,c.id ASC`,
      [postIds, offset, limit],
    );
    await this.preloadPeople(
      r.rows.flatMap((c) => [c.author_id, ...c.mentions.slice(0, 10)]),
    );
    const reactions = await this.reactionBatch(
      "comment",
      r.rows.map((c) => c.id),
    );
    const result = new Map<string, CommunityComment[]>();
    for (const c of r.rows) {
      const author = await this.person(c.author_id);
      if (!author) continue;
      const comments = result.get(c.post_id) ?? [];
      comments.push({
        id: c.id,
        postId: c.post_id,
        body: c.body,
        author,
        canEdit: c.author_id === this.uid,
        createdAt: c.created_at.toISOString(),
        updatedAt: c.updated_at.toISOString(),
        reactions: reactions.get(c.id) ?? [],
        mentions: await this.mentionPeople(c.mentions),
      });
      result.set(c.post_id, comments);
    }
    return result;
  }
  async posts(
    where = "true",
    values: unknown[] = [],
    offset = 0,
    detail = false,
  ): Promise<CommunityPost[]> {
    const r = await pool.query(
      `SELECT p.*,
       (SELECT count(*)::int FROM community_comments c JOIN users cu ON cu.id=c.author_id AND cu.status='active' WHERE c.post_id=p.id) AS comment_count,
       EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.user_id=$1::uuid AND b.target_type='post' AND b.target_id=p.id) AS bookmarked
       FROM community_posts p JOIN users u ON u.id=p.author_id AND u.status='active'
       WHERE (${where}) AND (${postReadWhere()} OR p.author_id=$1::uuid)
       ORDER BY p.created_at DESC,p.id DESC LIMIT 21 OFFSET $${values.length + 2}`,
      [this.uid, ...values, detail ? 0 : offset],
    );
    await this.preloadPeople(
      r.rows.flatMap((p) => [p.author_id, ...p.mentions.slice(0, 10)]),
    );
    const ids = r.rows.map((p) => p.id);
    const [reactions, comments] = await Promise.all([
      this.reactionBatch("post", ids),
      this.commentsForPosts(ids, detail ? 21 : 3, detail ? offset : 0),
    ]);
    const posts: CommunityPost[] = [];
    for (const p of r.rows) {
      const author = await this.person(p.author_id);
      if (!author) continue;
      posts.push({
        id: p.id,
        body: p.body,
        tags: p.tags,
        projectId: p.project_id,
        author,
        canEdit: p.author_id === this.uid,
        createdAt: p.created_at.toISOString(),
        updatedAt: p.updated_at.toISOString(),
        bookmarked: p.bookmarked,
        commentCount: p.comment_count,
        comments: comments.get(p.id) ?? [],
        reactions: reactions.get(p.id) ?? [],
        mentions: await this.mentionPeople(p.mentions),
      });
    }
    return posts;
  }
  async organizations(
    where = "true",
    values: unknown[] = [],
    offset = 0,
    detail = false,
  ): Promise<CommunityOrganization[]> {
    const r = await pool.query(
      `SELECT o.*,coalesce(op.description,'') AS description,coalesce(op.website,'') AS website,coalesce(op.visibility,'public') AS visibility,
    (SELECT count(*)::int FROM organization_members m JOIN users mu ON mu.id=m.user_id AND mu.status='active' WHERE m.organization_id=o.id AND m.status='active') AS member_count
    FROM organizations o LEFT JOIN community_organization_profiles op ON op.organization_id=o.id
    WHERE (coalesce(op.visibility,'public')='public' OR ${memberAccessWhere("o.id")} OR ${PENDING_INVITE("o.id")})
    AND (${where}) ORDER BY o.created_at DESC,o.id DESC LIMIT 21 OFFSET $${values.length + 2}`,
      [this.uid, ...values, offset],
    );
    return Promise.all(
      r.rows.map(async (o) => {
        const role = await orgRole(o.id, this.uid);
        const canManage =
          (role === "organization_owner" || role === "organization_admin") &&
          (await orgPermission(
            o.id,
            this.uid,
            "community.organization.manage",
          ));
        const memberRows =
          detail && role
            ? await pool.query(
                `SELECT m.user_id,r.key FROM organization_members m JOIN roles r ON r.id=m.role_id JOIN users u ON u.id=m.user_id AND u.status='active'
      WHERE m.organization_id=$1 AND m.status='active' ORDER BY m.created_at LIMIT 500`,
                [o.id],
              )
            : { rows: [] };
        await this.preloadPeople(memberRows.rows.map((m) => m.user_id));
        const members =
          detail && role
            ? await Promise.all(
                memberRows.rows.map(async (m) => ({
                  person: (await this.person(m.user_id))!,
                  role: m.key,
                })),
              )
            : [];
        const myInvite =
          role || !this.uid
            ? undefined
            : (
                await pool.query(
                  `SELECT r.key,i.expires_at FROM organization_invitations i JOIN roles r ON r.id=i.role_id
                WHERE i.organization_id=$1 AND i.user_id=$2::uuid AND i.declined_at IS NULL AND i.expires_at>now()`,
                  [o.id, this.uid],
                )
              ).rows[0];
        const inviteRows =
          detail && canManage
            ? (
                await pool.query(
                  `SELECT i.user_id,r.key,i.created_at,i.expires_at FROM organization_invitations i JOIN roles r ON r.id=i.role_id
                  JOIN users u ON u.id=i.user_id AND u.status='active'
                  WHERE i.organization_id=$1 AND i.declined_at IS NULL AND i.expires_at>now() ORDER BY i.created_at LIMIT 100`,
                  [o.id],
                )
              ).rows
            : [];
        await this.preloadPeople(inviteRows.map((i) => i.user_id));
        const invitations = (
          await Promise.all(
            inviteRows.map(async (i) => ({
              person: await this.person(i.user_id),
              role: i.key,
              createdAt: i.created_at.toISOString(),
              expiresAt: i.expires_at.toISOString(),
            })),
          )
        ).filter((i) => i.person);
        const teamRows =
          detail && role
            ? (
                await pool.query(
                  "SELECT * FROM community_teams WHERE organization_id=$1 ORDER BY name LIMIT 50",
                  [o.id],
                )
              ).rows
            : [];
        const teams = await Promise.all(
          teamRows.map(async (t) => {
            const memberIds = await pool.query(
              `SELECT tm.user_id FROM community_team_members tm JOIN organization_members m ON m.user_id=tm.user_id AND m.organization_id=$2 AND m.status='active'
      WHERE tm.team_id=$1 LIMIT 100`,
              [t.id, o.id],
            );
            await this.preloadPeople(memberIds.rows.map((m) => m.user_id));
            const people = await Promise.all(
              memberIds.rows.map((m) => this.person(m.user_id)),
            );
            return {
              id: t.id,
              name: t.name,
              description: t.description,
              members: people.filter((p): p is CommunityPerson => !!p),
            };
          }),
        );
        return {
          id: o.id,
          slug: o.slug,
          name: o.name,
          description: o.description,
          website: o.website,
          visibility: o.visibility,
          memberCount: o.member_count,
          myRole: role,
          canManage,
          canManageRoles:
            role === "organization_owner" &&
            (await orgPermission(
              o.id,
              this.uid,
              "community.organization.members",
            )),
          members,
          invitations,
          myInvitation: myInvite
            ? {
                role: myInvite.key,
                expiresAt: myInvite.expires_at.toISOString(),
              }
            : null,
          teams,
          repositories:
            detail && role
              ? await this.entryRows(
                  "organization_id=$1",
                  [o.id],
                  canManage,
                  false,
                )
              : [],
          projects: detail
            ? (await this.projects("p.organization_id=$2", [o.id])).slice(0, 20)
            : [],
        } as CommunityOrganization;
      }),
    );
  }
  async projectById(id: string) {
    const p = (await this.projects("p.id=$2", [id]))[0];
    if (!p) throw missing();
    return p;
  }
}
