// Must match artifacts/api-server/src/services/notification-preferences.ts.
export const NOTIFICATION_CATEGORIES = [
  {
    key: "activity",
    label: "Replies, mentions and reactions",
    description: "Someone comments on, mentions you in, or reacts to your work",
  },
  {
    key: "follows",
    label: "New followers",
    description: "Someone starts following you",
  },
  {
    key: "invitations",
    label: "Invitations",
    description: "Project, organization and team invitations",
  },
  {
    key: "applications",
    label: "Applications and hiring",
    description: "Updates and messages on jobs you applied to or posted",
  },
] as const;
export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[number]["key"];
export type ChannelPreference = { inApp: boolean; email: boolean };
