const ranks: Record<string, number> = {
  organization_member: 1,
  organization_admin: 2,
  organization_owner: 3,
};
// Higher ranks hold more access; a missing membership ranks 0.
export const roleRank = (role: string | null | undefined) =>
  role ? (ranks[role] ?? 0) : 0;
