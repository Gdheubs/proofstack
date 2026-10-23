CREATE TYPE "public"."profile_visibility" AS ENUM('public', 'members');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "headline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "links" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "visibility" "profile_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- Members who already claimed a handle have effectively finished onboarding.
UPDATE "profiles" SET "onboarded_at"=now() WHERE "handle" IS NOT NULL;
