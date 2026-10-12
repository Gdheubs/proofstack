CREATE TABLE "repository_pull_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"source_head" text NOT NULL,
	"target_head" text NOT NULL,
	"status" text NOT NULL,
	"details" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pull_check_status_check" CHECK ("repository_pull_checks"."status" in ('passed','failed'))
);
--> statement-breakpoint
CREATE TABLE "repository_pull_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"author_id" uuid,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"source_branch" text NOT NULL,
	"target_branch" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"issue_id" uuid,
	"source_head" text NOT NULL,
	"target_head" text NOT NULL,
	"merge_head" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pull_request_status_check" CHECK ("repository_pull_requests"."status" in ('draft','open','closed','merged')),
	CONSTRAINT "pull_request_distinct_branches" CHECK ("repository_pull_requests"."source_branch"<>"repository_pull_requests"."target_branch")
);
--> statement-breakpoint
CREATE TABLE "repository_pull_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"source_head" text NOT NULL,
	"target_head" text NOT NULL,
	"decision" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pull_review_decision_check" CHECK ("repository_pull_reviews"."decision" in ('approved','changes-requested'))
);
--> statement-breakpoint
CREATE TABLE "repository_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"author_id" uuid,
	"tag" text NOT NULL,
	"title" text NOT NULL,
	"notes" text NOT NULL,
	"commit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository_pull_checks" ADD CONSTRAINT "repository_pull_checks_pull_request_id_repository_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."repository_pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_comments" ADD CONSTRAINT "repository_pull_comments_pull_request_id_repository_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."repository_pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_comments" ADD CONSTRAINT "repository_pull_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_requests" ADD CONSTRAINT "repository_pull_requests_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_requests" ADD CONSTRAINT "repository_pull_requests_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_requests" ADD CONSTRAINT "repository_pull_requests_issue_id_project_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."project_issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_reviews" ADD CONSTRAINT "repository_pull_reviews_pull_request_id_repository_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."repository_pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_reviews" ADD CONSTRAINT "repository_pull_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_releases" ADD CONSTRAINT "repository_releases_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_releases" ADD CONSTRAINT "repository_releases_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pull_check_snapshot_unique" ON "repository_pull_checks" USING btree ("pull_request_id","source_head","target_head");--> statement-breakpoint
CREATE INDEX "pull_comment_created_idx" ON "repository_pull_comments" USING btree ("pull_request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_request_number_unique" ON "repository_pull_requests" USING btree ("repository_id","number");--> statement-breakpoint
CREATE INDEX "pull_request_repo_status_idx" ON "repository_pull_requests" USING btree ("repository_id","status","created_at");--> statement-breakpoint
CREATE INDEX "pull_review_latest_idx" ON "repository_pull_reviews" USING btree ("pull_request_id","reviewer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_release_tag_unique" ON "repository_releases" USING btree ("repository_id","tag");--> statement-breakpoint
CREATE INDEX "repository_release_created_idx" ON "repository_releases" USING btree ("repository_id","created_at");