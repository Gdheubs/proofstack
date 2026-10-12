CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quota_bytes" bigint DEFAULT 52428800 NOT NULL,
	CONSTRAINT "repository_quota_positive" CHECK ("repositories"."quota_bytes">0)
);
--> statement-breakpoint
CREATE TABLE "repository_branches" (
	"repository_id" uuid NOT NULL,
	"name" text NOT NULL,
	"head" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_branches_repository_id_name_pk" PRIMARY KEY("repository_id","name"),
	CONSTRAINT "repository_head_sha" CHECK ("repository_branches"."head" ~ '^[0-9a-f]{40}$')
);
--> statement-breakpoint
CREATE TABLE "repository_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_project_id_community_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."community_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_branches" ADD CONSTRAINT "repository_branches_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_tokens" ADD CONSTRAINT "repository_tokens_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_tokens" ADD CONSTRAINT "repository_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_project_unique" ON "repositories" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_token_hash_unique" ON "repository_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "repository_token_user_idx" ON "repository_tokens" USING btree ("user_id","repository_id");