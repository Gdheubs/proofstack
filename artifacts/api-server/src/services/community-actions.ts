import type { Request } from "express";
import { parseCommunityAction } from "./community-input";
import { transaction, audit, type AuthSession } from "./auth-sessions";
import {
  requireCommunityProfile,
  notificationReadWhere,
} from "./community-policy";
import { socialAction } from "./community-social-actions";
import { projectAction } from "./community-project-actions";
import { organizationAction } from "./community-org-actions";
import { assetAction, assertOwnedAssets } from "./community-assets";
import { ApiError } from "../lib/errors";
export async function runCommunityAction(
  req: Request,
  s: AuthSession,
  body: unknown,
) {
  const input = parseCommunityAction(body);
  return transaction(async (db) => {
    let result;
    if (input.action === "profile-save") {
      const old = (
        await db.query(
          "SELECT avatar_url FROM profiles WHERE user_id=$1 FOR UPDATE",
          [s.user.id],
        )
      ).rows[0];
      if (input.avatarPath)
        await assertOwnedAssets(
          db,
          s.user.id,
          [input.avatarPath],
          [old?.avatar_url || ""],
        );
      await db.query(
        "UPDATE profiles SET handle=$2,display_name=$3,bio=$4,location=$5,skills=$6::jsonb,avatar_url=$7,headline=$8,links=$9::jsonb,updated_at=now() WHERE user_id=$1",
        [
          s.user.id,
          input.handle,
          input.displayName,
          input.bio,
          input.location,
          JSON.stringify(input.skills),
          input.avatarPath === undefined
            ? old?.avatar_url
            : input.avatarPath || null,
          input.headline,
          JSON.stringify(input.links),
        ],
      );
      result = { message: "Public profile saved", handle: input.handle };
    } else if (input.action === "notification-preferences-save") {
      await db.query(
        "UPDATE users SET notification_prefs=$2::jsonb,updated_at=now() WHERE id=$1",
        [s.user.id, JSON.stringify(input.preferences)],
      );
      result = { message: "Notification preferences saved" };
    } else if (input.action === "privacy-save") {
      await db.query(
        "UPDATE profiles SET visibility=$2,updated_at=now() WHERE user_id=$1",
        [s.user.id, input.profileVisibility],
      );
      result = { message: "Privacy settings saved" };
    } else if (input.action === "onboarding-complete") {
      await db.query(
        "UPDATE profiles SET onboarded_at=coalesce(onboarded_at,now()) WHERE user_id=$1",
        [s.user.id],
      );
      result = { message: "Welcome aboard" };
    } else if (input.action === "notification-read") {
      await db.query(
        `UPDATE notifications n SET read_at=coalesce(n.read_at,now()) WHERE ${notificationReadWhere()} ${input.id ? "AND n.id=$2" : ""}`,
        [s.user.id, ...(input.id ? [input.id] : [])],
      );
      result = {
        message: input.id
          ? "Notification marked read"
          : "All notifications marked read",
      };
    } else {
      result = await assetAction(db, s, input);
      if (!result) {
        const actor = await requireCommunityProfile(s.user.id, db);
        result =
          (await socialAction(db, s, input, actor)) ||
          (await projectAction(db, s, input)) ||
          (await organizationAction(db, s, input));
      }
    }
    if (!result)
      throw new ApiError(
        400,
        "INVALID_COMMUNITY_INPUT",
        "Unsupported community action",
      );
    await audit(
      req,
      `community.${input.action}`,
      s.user.id,
      "id" in input ? input.id : undefined,
      {},
      db,
    );
    return result;
  });
}
