import { pgEnum } from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);
export const organizationMemberStatusEnum = pgEnum(
  "organization_member_status",
  ["active", "inactive"],
);
