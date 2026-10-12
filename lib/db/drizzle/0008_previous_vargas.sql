CREATE TABLE "intelligence_budgets" (
	"scope" text NOT NULL,
	"day" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "intelligence_budgets_scope_day_pk" PRIMARY KEY("scope","day"),
	CONSTRAINT "intelligence_budget_check" CHECK ("intelligence_budgets"."used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "intelligence_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"repository_id" uuid,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_id" uuid,
	"lease_until" timestamp with time zone,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_started_at" timestamp with time zone,
	"model" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"estimated_cost_micros" integer,
	"error" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "intelligence_kind_check" CHECK ("intelligence_jobs"."kind" in ('opportunities','career-plan','security-scan')),
	CONSTRAINT "intelligence_status_check" CHECK ("intelligence_jobs"."status" in ('queued','running','succeeded','failed','cancelled')),
	CONSTRAINT "intelligence_attempt_check" CHECK ("intelligence_jobs"."attempts" between 0 and 3),
	CONSTRAINT "intelligence_repository_check" CHECK (("intelligence_jobs"."kind"='security-scan') = ("intelligence_jobs"."repository_id" is not null)),
	CONSTRAINT "intelligence_usage_check" CHECK (coalesce("intelligence_jobs"."prompt_tokens",0)>=0 and coalesce("intelligence_jobs"."completion_tokens",0)>=0 and coalesce("intelligence_jobs"."estimated_cost_micros",0)>=0)
);
--> statement-breakpoint
ALTER TABLE "intelligence_jobs" ADD CONSTRAINT "intelligence_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_jobs" ADD CONSTRAINT "intelligence_jobs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_request_unique" ON "intelligence_jobs" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE INDEX "intelligence_owner_created_idx" ON "intelligence_jobs" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "intelligence_queue_idx" ON "intelligence_jobs" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "intelligence_lease_idx" ON "intelligence_jobs" USING btree ("status","lease_until");