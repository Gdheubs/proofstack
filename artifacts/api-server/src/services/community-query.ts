import { pool } from "@workspace/db";
import {
  GetCommunityQueryParams,
  type CommunityData,
} from "@workspace/api-zod";
import { CommunityReader } from "./community-reader";
import {
  missing,
  memberAccessWhere,
  postReadWhere,
  projectReadWhere,
} from "./community-policy";
import { ApiError } from "../lib/errors";
export async function getCommunity(
  query: unknown,
  uid: string | null,
): Promise<CommunityData> {
  const parsed = GetCommunityQueryParams.safeParse(query);
  if (!parsed.success)
    throw new ApiError(
      400,
      "INVALID_COMMUNITY_QUERY",
      "Check your search or page parameters",
    );
  const q = parsed.data;
  const reader = new CommunityReader(uid);
  const offset = Number(q.offset || 0);
  const data: CommunityData = {
    viewer: uid ? await reader.person(uid) : null,
    profile: null,
    project: null,
    organization: null,
    post: null,
    people: [],
    projects: [],
    organizations: [],
    posts: [],
    entries: [],
    activity: [],
    notifications: [],
    skills: [],
    unreadCount: 0,
    offset,
    hasMore: false,
  };
  if (uid)
    data.unreadCount = (
      await pool.query(
        "SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL",
        [uid],
      )
    ).rows[0].n;
  const needsUser = () => {
    if (!uid)
      throw new ApiError(
        401,
        "SIGN_IN_REQUIRED",
        "Sign in and complete security verification to continue",
      );
    return uid;
  };
  const page = <T>(rows: T[]) => {
    data.hasMore = data.hasMore || rows.length > 20;
    return rows.slice(0, 20);
  };
  if (q.view === "feed") {
    const following = q.filter === "following";
    if (following || q.filter === "mine") needsUser();
    data.posts = page(
      await reader.posts(
        following
          ? "p.author_id=$1::uuid OR EXISTS(SELECT 1 FROM community_follows f WHERE f.follower_id=$1::uuid AND f.following_id=p.author_id)"
          : q.filter === "mine"
            ? "p.author_id=$1::uuid"
            : "true",
        [],
        offset,
      ),
    );
  } else if (q.view === "post") {
    if (!q.id) throw missing();
    data.post =
      (await reader.posts("p.id=$2", [q.id], offset, true))[0] || null;
    if (!data.post) throw missing();
    data.hasMore = data.post.comments.length > 20;
    data.post.comments = data.post.comments.slice(0, 20);
  } else if (q.view === "profile") {
    const p =
      q.handle === "me"
        ? needsUser()
        : q.id ||
          (
            await pool.query("SELECT user_id FROM profiles WHERE handle=$1", [
              q.handle?.toLowerCase() || "",
            ])
          ).rows[0]?.user_id;
    if (!p) throw missing();
    data.profile = await reader.person(p);
    if (!data.profile || (!data.profile.handle && p !== uid)) throw missing();
    if (q.filter === "followers" || q.filter === "following-list") {
      const reverse = q.filter === "followers";
      const ids = await pool.query(
        `SELECT f.${reverse ? "follower_id" : "following_id"} AS uid FROM community_follows f JOIN users u ON u.id=f.${reverse ? "follower_id" : "following_id"} AND u.status='active' WHERE f.${reverse ? "following_id" : "follower_id"}=$1 ORDER BY f.created_at DESC LIMIT 21 OFFSET $2`,
        [p, offset],
      );
      await reader.preloadPeople(ids.rows.map((r) => r.uid));
      const people = await Promise.all(
        ids.rows.map((r) => reader.person(r.uid)),
      );
      data.people = page(people.filter((p): p is NonNullable<typeof p> => !!p));
    } else {
      data.entries = await reader.entryRows(
        "user_id=$1 AND project_id IS NULL AND organization_id IS NULL",
        [p],
      );
      data.projects = page(
        await reader.projects(
          "p.owner_id=$2 OR EXISTS(SELECT 1 FROM community_contributors c WHERE c.project_id=p.id AND c.user_id=$2 AND c.status='active')",
          [p],
          offset,
        ),
      );
      data.posts = (await reader.posts("p.author_id=$2", [p])).slice(0, 20);
      const activity = await pool.query(
        `SELECT e.id,e.type,e.payload->>'title' AS title,e.payload->>'href' AS href,e.created_at AS "createdAt" FROM events e
     WHERE e.actor_user_id=$2 AND e.type LIKE 'community.%' AND (
      (e.type LIKE 'community.post%' AND EXISTS(SELECT 1 FROM community_posts x JOIN users post_author ON post_author.id=x.author_id AND post_author.status='active' WHERE x.id::text=e.payload->>'resourceId' AND ${postReadWhere("x")}))
      OR (e.type LIKE 'community.project%' AND EXISTS(SELECT 1 FROM community_projects p LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id WHERE p.id::text=e.payload->>'resourceId' AND ${projectReadWhere()}))
      OR (e.type LIKE 'community.entry%' AND EXISTS(SELECT 1 FROM community_entries x WHERE x.id::text=e.payload->>'resourceId' AND x.project_id IS NULL AND x.organization_id IS NULL))
     ) ORDER BY e.created_at DESC LIMIT 30`,
        [uid, p],
      );
      data.activity = activity.rows.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      }));
    }
  } else if (q.view === "projects") {
    if (q.filter === "mine") needsUser();
    data.projects = page(
      await reader.projects(
        q.filter === "mine"
          ? "p.owner_id=$1::uuid OR EXISTS(SELECT 1 FROM community_contributors c WHERE c.project_id=p.id AND c.user_id=$1::uuid AND c.status='active')"
          : "true",
        [],
        offset,
      ),
    );
  } else if (q.view === "project") {
    data.project =
      (
        await reader.projects(q.id ? "p.id=$2" : "p.slug=$2", [
          q.id || q.handle || "",
        ])
      )[0] || null;
    if (!data.project) throw missing();
  } else if (q.view === "organizations") {
    if (q.filter === "mine") needsUser();
    data.organizations = page(
      await reader.organizations(
        q.filter === "mine" ? memberAccessWhere("o.id") : "true",
        [],
        offset,
      ),
    );
  } else if (q.view === "organization") {
    data.organization =
      (
        await reader.organizations(
          q.id ? "o.id=$2" : "o.slug=$2",
          [q.id || q.handle || ""],
          0,
          true,
        )
      )[0] || null;
    if (!data.organization) throw missing();
  } else if (q.view === "notifications") {
    const uid = needsUser();
    const r = await pool.query(
      'SELECT id,title,body,href,read_at IS NOT NULL AS read,created_at AS "createdAt" FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 21 OFFSET $2',
      [uid, offset],
    );
    data.notifications = page(
      r.rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    );
  } else if (q.view === "bookmarks") {
    needsUser();
    data.posts = page(
      await reader.posts(
        "EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.user_id=$1::uuid AND b.target_type='post' AND b.target_id=p.id)",
        [],
        offset,
      ),
    );
    data.projects = page(
      await reader.projects(
        "EXISTS(SELECT 1 FROM community_bookmarks b WHERE b.user_id=$1::uuid AND b.target_type='project' AND b.target_id=p.id)",
        [],
        offset,
      ),
    );
  } else if (q.view === "search") {
    const needle = (q.q || "").trim().replace(/[\\%_]/g, "\\$&");
    const term = `%${needle}%`;
    const type = q.type || "all";
    if (type === "all" || type === "developers" || type === "skills") {
      const ids = await pool.query(
        "SELECT p.user_id FROM profiles p JOIN users u ON u.id=p.user_id AND u.status='active' WHERE p.handle IS NOT NULL AND (p.handle ILIKE $1 OR p.display_name ILIKE $1 OR p.bio ILIKE $1 OR p.skills::text ILIKE $1) ORDER BY p.display_name LIMIT 21 OFFSET $2",
        [term, offset],
      );
      await reader.preloadPeople(ids.rows.map((r) => r.user_id));
      const people = await Promise.all(
        ids.rows.map((r) => reader.person(r.user_id)),
      );
      data.people = page(people.filter((p): p is NonNullable<typeof p> => !!p));
      const skills = await pool.query(
        "SELECT DISTINCT s.skill FROM profiles p JOIN users u ON u.id=p.user_id AND u.status='active' CROSS JOIN LATERAL jsonb_array_elements_text(p.skills) AS s(skill) WHERE p.handle IS NOT NULL AND s.skill ILIKE $1 ORDER BY s.skill LIMIT 50",
        [term],
      );
      data.skills = skills.rows.map((s) => s.skill);
    }
    if (type === "all" || type === "projects")
      data.projects = page(
        await reader.projects(
          "p.title ILIKE $2 OR p.description ILIKE $2 OR p.technologies::text ILIKE $2",
          [term],
          offset,
        ),
      );
    if (type === "all" || type === "organizations")
      data.organizations = page(
        await reader.organizations(
          "o.name ILIKE $2 OR coalesce(op.description,'') ILIKE $2",
          [term],
          offset,
        ),
      );
    if (type === "all" || type === "posts")
      data.posts = page(
        await reader.posts(
          "p.body ILIKE $2 OR p.tags::text ILIKE $2",
          [term],
          offset,
        ),
      );
  }
  return data;
}
