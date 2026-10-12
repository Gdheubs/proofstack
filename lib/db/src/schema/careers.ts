import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";
import { communityProjectsTable } from "./community-projects";
const times = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const careerProfilesTable = pgTable(
  "career_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    headline: text("headline").notNull().default(""),
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    availability: text("availability").notNull().default("closed"),
    discoverable: boolean("discoverable").notNull().default(false),
    featuredProjects: jsonb("featured_projects")
      .$type<string[]>()
      .notNull()
      .default([]),
    ...times(),
  },
  (t) => [
    check(
      "career_availability_check",
      sql`${t.availability} in ('open','exploring','closed')`,
    ),
    index("career_discovery_idx").on(t.discoverable, t.availability),
  ],
);
export const careerJobsTable = pgTable(
  "career_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    kind: text("kind").notNull(),
    workplace: text("workplace").notNull(),
    location: text("location").notNull().default(""),
    compensation: text("compensation").notNull().default(""),
    status: text("status").notNull().default("draft"),
    ...times(),
  },
  (t) => [
    index("career_jobs_org_idx").on(t.organizationId),
    index("career_jobs_status_created_idx").on(t.status, t.createdAt, t.id),
    check(
      "career_job_status_check",
      sql`${t.status} in ('draft','open','closed')`,
    ),
    check(
      "career_job_kind_check",
      sql`${t.kind} in ('job','internship','contract','collaboration')`,
    ),
    check(
      "career_job_workplace_check",
      sql`${t.workplace} in ('remote','hybrid','onsite')`,
    ),
  ],
);
export const careerApplicationsTable = pgTable(
  "career_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => careerJobsTable.id, { onDelete: "cascade" }),
    applicantId: uuid("applicant_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    note: text("note").notNull(),
    projectIds: jsonb("project_ids").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("submitted"),
    ...times(),
  },
  (t) => [
    uniqueIndex("career_application_unique").on(t.jobId, t.applicantId),
    index("career_application_user_idx").on(t.applicantId, t.createdAt),
    index("career_application_job_status_idx").on(t.jobId, t.status),
    check(
      "career_application_status_check",
      sql`${t.status} in ('submitted','reviewing','shortlisted','interview','offered','rejected','withdrawn')`,
    ),
  ],
);
export const careerMessagesTable = pgTable(
  "career_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => careerApplicationsTable.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("career_message_thread_idx").on(t.applicationId, t.createdAt, t.id),
  ],
);
export const projectIssuesTable = pgTable(
  "project_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => communityProjectsTable.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("open"),
    evidenceUrl: text("evidence_url").notNull().default(""),
    ...times(),
  },
  (t) => [
    index("project_issue_board_idx").on(t.projectId, t.createdAt, t.id),
    index("project_issue_assignee_idx").on(t.assigneeId),
    check(
      "project_issue_status_check",
      sql`${t.status} in ('open','in-progress','done')`,
    ),
  ],
);
