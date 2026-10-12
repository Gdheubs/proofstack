import type { CommunityAction } from "./community-input";
import { mentionHandles } from "./community-input";
import { ApiError } from "../lib/errors";
import type { CommunityDb } from "./community-policy";
import {
  handleUser,
  notify,
  missing,
  denied,
  authorizeProject,
  recordActivity,
  postReadWhere,
} from "./community-policy";
import type { AuthSession } from "./auth-sessions";
import type { QueryResultRow } from "pg";
async function mentions(db: CommunityDb, body: string) {
  const handles = mentionHandles(body);
  if (!handles.length) return [] as string[];
  const found = await db.query(
    "SELECT p.user_id FROM profiles p JOIN users u ON u.id=p.user_id AND u.status='active' WHERE p.handle=ANY($1::text[])",
    [handles],
  );
  return found.rows.map((r) => r.user_id as string);
}
export async function visiblePost(db: CommunityDb, id: string) {
  const r = await db.query(
    `SELECT p.* FROM community_posts p JOIN users u ON u.id=p.author_id AND u.status='active' WHERE p.id=$1
  AND ${postReadWhere()} FOR UPDATE OF p`,
    [id],
  );
  if (!r.rows[0]) throw missing();
  return r.rows[0];
}
export async function ownedPost(db: CommunityDb, id: string, uid: string) {
  const result = await db.query(
    "SELECT * FROM community_posts WHERE id=$1 AND author_id=$2 FOR UPDATE",
    [id, uid],
  );
  if (!result.rows[0]) throw missing();
  return result.rows[0];
}
export async function socialAction(
  db: CommunityDb,
  s: AuthSession,
  input: CommunityAction,
  actor: { handle: string; display_name: string },
) {
  const uid = s.user.id;
  if (input.action === "follow") {
    if (uid === input.targetId)
      throw new ApiError(400, "SELF_FOLLOW", "You cannot follow yourself");
    const target = await db.query(
      "SELECT p.user_id FROM profiles p JOIN users u ON u.id=p.user_id AND u.status='active' WHERE p.user_id=$1 AND p.handle IS NOT NULL",
      [input.targetId],
    );
    if (!target.rows[0]) throw missing();
    if (input.enabled) {
      const r = await db.query(
        "INSERT INTO community_follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING follower_id",
        [uid, input.targetId],
      );
      if (r.rowCount)
        await notify(
          db,
          input.targetId,
          uid,
          "New follower",
          `${actor.display_name} followed you`,
          `/profile/${actor.handle}`,
        );
    } else
      await db.query(
        "DELETE FROM community_follows WHERE follower_id=$1 AND following_id=$2",
        [uid, input.targetId],
      );
    return { message: input.enabled ? "Following developer" : "Unfollowed" };
  }
  if (input.action === "post-save") {
    let old: QueryResultRow | undefined;
    if (input.id) {
      old = await ownedPost(db, input.id, uid);
      if (!old || old.author_id !== uid) throw denied();
    }
    if (input.projectId) {
      const project = await authorizeProject(db, s, input.projectId, "read");
      const op = project.organization_id
        ? (
            await db.query(
              "SELECT visibility FROM community_organization_profiles WHERE organization_id=$1",
              [project.organization_id],
            )
          ).rows[0]
        : null;
      if (project.visibility !== "public" || op?.visibility === "private")
        throw new ApiError(
          400,
          "PRIVATE_PROJECT_POST",
          "Public posts can only link public projects",
        );
    }
    const ids = await mentions(db, input.body);
    const r = input.id
      ? await db.query(
          "UPDATE community_posts SET body=$2,tags=$3::jsonb,mentions=$4::jsonb,project_id=$5,updated_at=now() WHERE id=$1 RETURNING id",
          [
            input.id,
            input.body,
            JSON.stringify(input.tags),
            JSON.stringify(ids),
            input.projectId || null,
          ],
        )
      : await db.query(
          "INSERT INTO community_posts(author_id,body,tags,mentions,project_id) VALUES($1,$2,$3::jsonb,$4::jsonb,$5) RETURNING id",
          [
            uid,
            input.body,
            JSON.stringify(input.tags),
            JSON.stringify(ids),
            input.projectId || null,
          ],
        );
    const id = r.rows[0].id as string;
    for (const recipient of ids.filter((id) => !old?.mentions?.includes(id)))
      await notify(
        db,
        recipient,
        uid,
        "You were mentioned",
        `${actor.display_name} mentioned you in a post`,
        `/posts/${id}`,
      );
    if (!input.id)
      await recordActivity(
        db,
        uid,
        "post-created",
        "Published a post",
        `/posts/${id}`,
        id,
      );
    return { message: input.id ? "Post updated" : "Post published", id };
  }
  if (input.action === "post-delete") {
    const p = await ownedPost(db, input.id, uid);
    if (p.author_id !== uid) throw denied();
    const comments = await db.query(
      "SELECT id FROM community_comments WHERE post_id=$1",
      [input.id],
    );
    await db.query(
      "DELETE FROM community_reactions WHERE (target_type='post' AND target_id=$1) OR (target_type='comment' AND target_id=ANY($2::uuid[]))",
      [input.id, comments.rows.map((c) => c.id)],
    );
    await db.query(
      "DELETE FROM community_bookmarks WHERE target_type='post' AND target_id=$1",
      [input.id],
    );
    await db.query(
      "DELETE FROM events WHERE type LIKE 'community.post%' AND payload->>'resourceId'=$1",
      [input.id],
    );
    await db.query("DELETE FROM community_posts WHERE id=$1", [input.id]);
    return { message: "Post deleted" };
  }
  if (input.action === "comment-save") {
    const post = await visiblePost(db, input.targetId);
    let old: QueryResultRow | undefined;
    if (input.id) {
      old = (
        await db.query(
          "SELECT * FROM community_comments WHERE id=$1 FOR UPDATE",
          [input.id],
        )
      ).rows[0];
      if (!old || old.post_id !== post.id) throw missing();
      if (old.author_id !== uid) throw denied();
    }
    const ids = await mentions(db, input.body);
    const r = input.id
      ? await db.query(
          "UPDATE community_comments SET body=$2,mentions=$3::jsonb,updated_at=now() WHERE id=$1 RETURNING id",
          [input.id, input.body, JSON.stringify(ids)],
        )
      : await db.query(
          "INSERT INTO community_comments(post_id,author_id,body,mentions) VALUES($1,$2,$3,$4::jsonb) RETURNING id",
          [post.id, uid, input.body, JSON.stringify(ids)],
        );
    const recipients = new Set(
      ids.filter((id) => !old?.mentions?.includes(id)),
    );
    if (!input.id) recipients.add(post.author_id);
    for (const recipient of recipients)
      await notify(
        db,
        recipient,
        uid,
        recipient === post.author_id ? "New comment" : "You were mentioned",
        `${actor.display_name} commented on a post`,
        `/posts/${post.id}`,
      );
    return {
      message: input.id ? "Comment updated" : "Comment published",
      id: r.rows[0].id as string,
    };
  }
  if (input.action === "comment-delete") {
    const c = (
      await db.query(
        "SELECT * FROM community_comments WHERE id=$1 FOR UPDATE",
        [input.id],
      )
    ).rows[0];
    if (!c) throw missing();
    await visiblePost(db, c.post_id);
    if (c.author_id !== uid) throw denied();
    await db.query(
      "DELETE FROM community_reactions WHERE target_type='comment' AND target_id=$1",
      [input.id],
    );
    await db.query("DELETE FROM community_comments WHERE id=$1", [input.id]);
    return { message: "Comment deleted" };
  }
  if (input.action === "reaction" || input.action === "bookmark") {
    let owner = "",
      href = "";
    if (input.targetType === "project") {
      const p = await authorizeProject(db, s, input.targetId, "read");
      owner = p.owner_id;
      href = `/projects/${p.slug}`;
    } else if (input.targetType === "post") {
      const p = await visiblePost(db, input.targetId);
      owner = p.author_id;
      href = `/posts/${p.id}`;
    } else {
      const c = (
        await db.query(
          "SELECT * FROM community_comments WHERE id=$1 FOR UPDATE",
          [input.targetId],
        )
      ).rows[0];
      if (!c) throw missing();
      await visiblePost(db, c.post_id);
      owner = c.author_id;
      href = `/posts/${c.post_id}`;
    }
    if (input.action === "bookmark") {
      if (input.enabled)
        await db.query(
          "INSERT INTO community_bookmarks(user_id,target_type,target_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [uid, input.targetType, input.targetId],
        );
      else
        await db.query(
          "DELETE FROM community_bookmarks WHERE user_id=$1 AND target_type=$2 AND target_id=$3",
          [uid, input.targetType, input.targetId],
        );
    } else if (input.enabled) {
      const r = await db.query(
        "INSERT INTO community_reactions(user_id,target_type,target_id,kind) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING user_id",
        [uid, input.targetType, input.targetId, input.kind],
      );
      if (r.rowCount)
        await notify(
          db,
          owner,
          uid,
          "New reaction",
          `${actor.display_name} reacted to your ${input.targetType}`,
          href,
        );
    } else
      await db.query(
        "DELETE FROM community_reactions WHERE user_id=$1 AND target_type=$2 AND target_id=$3 AND kind=$4",
        [uid, input.targetType, input.targetId, input.kind],
      );
    return {
      message:
        input.action === "bookmark"
          ? input.enabled
            ? "Bookmarked"
            : "Bookmark removed"
          : input.enabled
            ? "Reaction added"
            : "Reaction removed",
    };
  }
  return null;
}
export { handleUser };
