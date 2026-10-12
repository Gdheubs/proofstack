CREATE TABLE "service_heartbeats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "service_heartbeat_seen_idx" ON "service_heartbeats" USING btree ("service","last_seen_at");--> statement-breakpoint
CREATE INDEX "community_projects_created_idx" ON "community_projects" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "intelligence_finished_idx" ON "intelligence_jobs" USING btree ("status","finished_at");