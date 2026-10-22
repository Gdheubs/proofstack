ALTER TABLE "profiles" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "kind" SET DEFAULT 'developer'::text;--> statement-breakpoint
-- Company accounts become recruiters; companies are represented by organizations.
UPDATE "profiles" SET "kind"='recruiter' WHERE "kind"='company';--> statement-breakpoint
DROP TYPE "public"."profile_kind";--> statement-breakpoint
CREATE TYPE "public"."profile_kind" AS ENUM('developer', 'recruiter');--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "kind" SET DEFAULT 'developer'::"public"."profile_kind";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "kind" SET DATA TYPE "public"."profile_kind" USING "kind"::"public"."profile_kind";