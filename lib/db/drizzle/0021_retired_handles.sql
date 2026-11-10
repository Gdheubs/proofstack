CREATE TABLE "retired_handles" (
	"handle" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retired_handles" ADD CONSTRAINT "retired_handles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retired_handles_user_idx" ON "retired_handles" USING btree ("user_id");