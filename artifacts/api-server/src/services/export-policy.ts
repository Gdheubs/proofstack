// What an account export returns for the rows it finds through one foreign
// key to users, keyed by "table.column":
//   "full"     every column of the row
//   [columns]  only these columns
//   "none"     nothing: an actor column, where the row is someone else's data
// A foreign key with no entry has no rule, so it is exported as nothing and
// fails the catalog test: a new table cannot leak by default.
export type ExportRule = "full" | "none" | readonly string[];

// Frozen: every foreign key to users in the 54 tables of migrations
// 0000-0021. They keep the behaviour they have always had (the whole row).
// Never add to this list; a later table needs an entry in EXPORT_POLICY.
export const EXPORT_BASELINE: readonly string[] = Object.freeze([
  "assessment_attempts.user_id",
  "audit_logs.actor_user_id",
  "auth_recovery_codes.user_id",
  "career_applications.applicant_id",
  "career_jobs.creator_id",
  "career_messages.author_id",
  "career_profiles.user_id",
  "community_assets.user_id",
  "community_bookmarks.user_id",
  "community_comments.author_id",
  "community_contributors.user_id",
  "community_entries.user_id",
  "community_follows.follower_id",
  "community_follows.following_id",
  "community_posts.author_id",
  "community_projects.owner_id",
  "community_reactions.user_id",
  "community_team_members.user_id",
  "consent_records.user_id",
  "events.actor_user_id",
  "github_connections.user_id",
  "intelligence_jobs.user_id",
  "notifications.user_id",
  "organization_invitations.invited_by",
  "organization_invitations.user_id",
  "organization_members.user_id",
  "profiles.user_id",
  "project_issues.assignee_id",
  "project_issues.author_id",
  "repositories.owner_id",
  "repository_pull_comments.author_id",
  "repository_pull_requests.author_id",
  "repository_pull_reviews.reviewer_id",
  "repository_releases.author_id",
  "repository_tokens.user_id",
  "retired_handles.user_id",
  "sessions.user_id",
]);

// A column list, frozen so that nothing can widen it while the process runs.
const only = (...columns: string[]): readonly string[] =>
  Object.freeze(columns);

// One entry per foreign key to users added from migration 0022 onward.
// Column lists leave out other people's ids (who granted or revoked).
export const EXPORT_POLICY: Readonly<Record<string, ExportRule>> =
  Object.freeze({
    // 0022_platform_foundation
    "platform_grants.user_id": only(
      "id",
      "capability",
      "source",
      "reason",
      "expires_at",
      "revoked_at",
      "created_at",
    ),
    "platform_grants.granted_by": "none",
    "platform_grants.revoked_by": "none",
    "organization_accounts.requested_by": "none",
    "organization_accounts.verified_by": "none",
    "organization_member_grants.user_id": only(
      "id",
      "organization_id",
      "capability",
      "revoked_at",
      "created_at",
    ),
    "organization_member_grants.granted_by": "none",
    "entitlements.user_id": only(
      "id",
      "feature",
      "limits",
      "starts_at",
      "ends_at",
      "source",
      "revoked_at",
      "created_at",
    ),
    "entitlements.granted_by": "none",
    "entitlement_uses.user_id": "full",
  });

const rules = new Map<string, ExportRule>([
  ...EXPORT_BASELINE.map((key): [string, ExportRule] => [key, "full"]),
  ...Object.entries(EXPORT_POLICY),
]);

// Undefined means the foreign key is unclassified: export nothing for it.
export function exportRule(
  table: string,
  column: string,
): ExportRule | undefined {
  return rules.get(`${table}.${column}`);
}
