// Which notifications a member wants, by category. Security notices (new
// device, recovery) are never optional and are not listed here.
export const NOTIFICATION_CATEGORIES = [
  "activity",
  "follows",
  "invitations",
  "applications",
] as const;
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

// Fills in defaults (everything on) for a stored, possibly partial, object.
export function normalizePreferences(raw: unknown): NotificationPreferences {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    Partial<ChannelPreference> | undefined
  >;
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((category) => [
      category,
      {
        inApp: stored[category]?.inApp !== false,
        email: stored[category]?.email !== false,
      },
    ]),
  ) as NotificationPreferences;
}
