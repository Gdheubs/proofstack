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
  {
    key: "opportunities",
    label: "New opportunities for your skills",
    description:
      "Open roles that share your listed skills. Email only; starts once email delivery exists",
  },
] as const;
// Opt-in categories: off until the member turns them on.
export const DEFAULT_OFF: ReadonlySet<string> = new Set(["opportunities"]);
export const channelDefault = (value: unknown, key: string) =>
  typeof value === "boolean" ? value : !DEFAULT_OFF.has(key);
export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[number]["key"];
export type ChannelPreference = { inApp: boolean; email: boolean };
