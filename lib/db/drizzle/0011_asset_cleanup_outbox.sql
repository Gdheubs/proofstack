CREATE TABLE "asset_cleanup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"object_path" text NOT NULL,
	"bucket" text NOT NULL,
	"namespace" text NOT NULL,
	"object_name" text NOT NULL,
	"generation" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"leased_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "asset_cleanup_jobs_asset_id_unique" UNIQUE("asset_id"),
	CONSTRAINT "asset_cleanup_state_check" CHECK ("asset_cleanup_jobs"."state" IN ('pending','leased','failed','complete')),
	CONSTRAINT "asset_cleanup_attempts_check" CHECK ("asset_cleanup_jobs"."attempts" BETWEEN 0 AND 8),
	CONSTRAINT "asset_cleanup_lease_check" CHECK (("asset_cleanup_jobs"."state" = 'leased') = ("asset_cleanup_jobs"."lease_token" IS NOT NULL AND "asset_cleanup_jobs"."leased_until" IS NOT NULL)),
	CONSTRAINT "asset_cleanup_target_check" CHECK ("asset_cleanup_jobs"."bucket" ~ '^[a-z0-9][a-z0-9._-]*$' AND "asset_cleanup_jobs"."namespace" ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$' AND "asset_cleanup_jobs"."namespace" !~ '(^|/)\.{1,2}(/|$)' AND "asset_cleanup_jobs"."object_path" ~ '^/objects/(ready|uploads)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND "asset_cleanup_jobs"."object_name" = "asset_cleanup_jobs"."namespace" || '/' || substring("asset_cleanup_jobs"."object_path" from 10)),
	CONSTRAINT "asset_cleanup_generation_check" CHECK ("asset_cleanup_jobs"."generation" IS NULL OR "asset_cleanup_jobs"."generation" ~ '^[1-9][0-9]{0,29}$')
);
--> statement-breakpoint
CREATE INDEX "asset_cleanup_jobs_poll_idx" ON "asset_cleanup_jobs" USING btree ("state","available_at");