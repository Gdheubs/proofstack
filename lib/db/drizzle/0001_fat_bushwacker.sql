CREATE TYPE "public"."profile_kind" AS ENUM('developer', 'company', 'recruiter');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('moderator', 'admin', 'super_admin');--> statement-breakpoint
CREATE TABLE "auth_failures" (
	"identifier_hash" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_flows" (
	"handle_hash" text PRIMARY KEY NOT NULL,
	"encrypted_payload" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_hook_receipts" (
	"event_hash" text PRIMARY KEY NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "kind" "profile_kind" DEFAULT 'developer' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "handle_hash" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "encrypted_credentials" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_hash" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_label" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_mfa_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "password_recovery" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_role" "platform_role";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_recovery_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_recovery_codes" ADD CONSTRAINT "auth_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_failures_window_idx" ON "auth_failures" USING btree ("window_started_at");--> statement-breakpoint
CREATE INDEX "auth_flows_expiry_idx" ON "auth_flows" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_hook_receipts_time_idx" ON "auth_hook_receipts" USING btree ("accepted_at");--> statement-breakpoint
CREATE INDEX "auth_recovery_codes_user_idx" ON "auth_recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_handle_hash_unique" ON "sessions" USING btree ("handle_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone");