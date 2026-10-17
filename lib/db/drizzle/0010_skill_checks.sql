CREATE TABLE "assessment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"assessment_id" text NOT NULL,
	"question_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"answers" jsonb,
	"result" jsonb,
	CONSTRAINT "assessment_version_check" CHECK ("assessment_attempts"."question_version" > 0),
	CONSTRAINT "assessment_completion_check" CHECK (("assessment_attempts"."completed_at" IS NULL AND "assessment_attempts"."answers" IS NULL AND "assessment_attempts"."result" IS NULL) OR ("assessment_attempts"."completed_at" IS NOT NULL AND "assessment_attempts"."answers" IS NOT NULL AND "assessment_attempts"."result" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_results_user_idx" ON "assessment_attempts" USING btree ("user_id","assessment_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_open_attempt_unique" ON "assessment_attempts" USING btree ("user_id","assessment_id") WHERE "assessment_attempts"."completed_at" IS NULL;