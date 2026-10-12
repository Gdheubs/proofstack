import {
  pgTable,
  uuid,
  text,
  timestamp,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";
export const communityOrganizationProfilesTable = pgTable(
  "community_organization_profiles",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    description: text("description").notNull().default(""),
    website: text("website").notNull().default(""),
    visibility: text("visibility").notNull().default("public"),
  },
);
export const communityTeamsTable = pgTable(
  "community_teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("community_teams_name_unique").on(t.organizationId, t.name),
  ],
);
export const communityTeamMembersTable = pgTable(
  "community_team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => communityTeamsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);
export const insertOrganizationProfileSchema = createInsertSchema(
  communityOrganizationProfilesTable,
);
export const insertTeamSchema = createInsertSchema(communityTeamsTable);
export const insertTeamMemberSchema = createInsertSchema(
  communityTeamMembersTable,
);
