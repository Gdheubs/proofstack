CREATE TABLE "career_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"note" text NOT NULL,
	"project_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_application_status_check" CHECK ("career_applications"."status" in ('submitted','reviewing','shortlisted','interview','offered','rejected','withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "career_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kind" text NOT NULL,
	"workplace" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"compensation" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_job_status_check" CHECK ("career_jobs"."status" in ('draft','open','closed')),
	CONSTRAINT "career_job_kind_check" CHECK ("career_jobs"."kind" in ('job','internship','contract','collaboration')),
	CONSTRAINT "career_job_workplace_check" CHECK ("career_jobs"."workplace" in ('remote','hybrid','onsite'))
);
--> statement-breakpoint
CREATE TABLE "career_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"availability" text DEFAULT 'closed' NOT NULL,
	"discoverable" boolean DEFAULT false NOT NULL,
	"featured_projects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_availability_check" CHECK ("career_profiles"."availability" in ('open','exploring','closed'))
);
--> statement-breakpoint
CREATE TABLE "project_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"assignee_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"evidence_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_issue_status_check" CHECK ("project_issues"."status" in ('open','in-progress','done'))
);
--> statement-breakpoint
ALTER TABLE "career_applications" ADD CONSTRAINT "career_applications_job_id_career_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."career_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_applications" ADD CONSTRAINT "career_applications_applicant_id_users_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_jobs" ADD CONSTRAINT "career_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_jobs" ADD CONSTRAINT "career_jobs_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_messages" ADD CONSTRAINT "career_messages_application_id_career_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."career_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_messages" ADD CONSTRAINT "career_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_profiles" ADD CONSTRAINT "career_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_project_id_community_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."community_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "career_application_unique" ON "career_applications" USING btree ("job_id","applicant_id");--> statement-breakpoint
CREATE INDEX "career_application_user_idx" ON "career_applications" USING btree ("applicant_id","created_at");--> statement-breakpoint
CREATE INDEX "career_application_job_status_idx" ON "career_applications" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "career_jobs_org_idx" ON "career_jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "career_jobs_status_created_idx" ON "career_jobs" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "career_message_thread_idx" ON "career_messages" USING btree ("application_id","created_at","id");--> statement-breakpoint
CREATE INDEX "career_discovery_idx" ON "career_profiles" USING btree ("discoverable","availability");--> statement-breakpoint
CREATE INDEX "project_issue_board_idx" ON "project_issues" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "project_issue_assignee_idx" ON "project_issues" USING btree ("assignee_id");