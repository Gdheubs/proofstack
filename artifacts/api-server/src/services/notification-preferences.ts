// Which notifications a member wants, by category. Security notices (new
// device, recovery) are never optional and are not listed here.
export const NOTIFICATION_CATEGORIES = [
  "activity",
  "follows",
  "invitations",
  "applications",
  "opportunities",
] as const;
// Opt-in categories: off until the member turns them on.
export const DEFAULT_OFF: ReadonlySet<string> = new Set(["opportunities"]);
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type ChannelPreference = { inApp: boolean; email: boolean };
export type NotificationPreferences = Record<
  NotificationCategory,
  ChannelPreference
>;

export const NOTIFICATION_LABELS: Record<
  NotificationCategory,
  { label: string; description: string }
> = {
  activity: {
    label: "Replies, mentions and reactions",
    description: "Someone comments on, mentions you in, or reacts to your work",
  },
  follows: {
    label: "New followers",
    description: "Someone starts following you",
  },
  invitations: {
    label: "Invitations",
    description: "Project, organization and team invitations",
  },
  applications: {
    label: "Applications and hiring",
    description: "Updates and messages on jobs you applied to or posted",
  },
  opportunities: {
    label: "New opportunities for your skills",
    description:
      "Open roles that share your listed skills. Email only; starts once email delivery exists",
  },
};

const TITLES: Record<string, NotificationCategory> = {
  "New comment": "activity",
  "You were mentioned": "activity",
  "New reaction": "activity",
  "New follower": "follows",
  "Project contributor invitation": "invitations",
  "Organization invitation": "invitations",
  "Organization membership updated": "invitations",
  "Organization access updated": "invitations",
  "Application updated": "applications",
  "Application message": "applications",
};

export function notificationCategory(title: string) {
  return TITLES[title] ?? null;
}

// Fills in defaults (on, except opt-in categories) for a stored, possibly
// partial, object.
const channel = (value: unknown, category: string) =>
  typeof value === "boolean" ? value : !DEFAULT_OFF.has(category);
export function normalizePreferences(raw: unknown): NotificationPreferences {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    Partial<ChannelPreference> | undefined
  >;
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((category) => [
      category,
      {
        inApp: channel(stored[category]?.inApp, category),
        email: channel(stored[category]?.email, category),
      },
    ]),
  ) as NotificationPreferences;
}
