CREATE TABLE "media_cleanup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"leased_until" timestamp with time zone,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_cleanup_provider_check" CHECK ("media_cleanup_jobs"."provider" IN ('stream','ai')),
	CONSTRAINT "media_cleanup_state_check" CHECK ("media_cleanup_jobs"."state" IN ('pending','leased','failed','complete')),
	CONSTRAINT "media_cleanup_attempts_check" CHECK ("media_cleanup_jobs"."attempts" BETWEEN 0 AND 8)
);
--> statement-breakpoint
CREATE TABLE "media_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"content_owner_kind" text,
	"content_org_id" uuid,
	"created_by" uuid,
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"storage" text NOT NULL,
	"namespace" text NOT NULL,
	"object_path" text,
	"external_id" text,
	"state" text NOT NULL,
	"content_type" text NOT NULL,
	"declared_bytes" bigint NOT NULL,
	"bytes" bigint,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"sha256" text,
	"thumbhash" text,
	"scan" text DEFAULT 'pending' NOT NULL,
	"moderation" text DEFAULT 'pending' NOT NULL,
	"upload_expires_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_objects_content_owner_check" CHECK ("media_objects"."content_owner_kind" IS NULL OR "media_objects"."content_owner_kind" IN ('platform','organization')),
	CONSTRAINT "media_objects_kind_check" CHECK ("media_objects"."kind" IN ('image','video','audio')),
	CONSTRAINT "media_objects_purpose_check" CHECK ("media_objects"."purpose" IN ('post','answer','interview','question','anchor')),
	CONSTRAINT "media_objects_content_owner_id_check" CHECK ((("media_objects"."purpose" IN ('question','anchor')) = ("media_objects"."owner_id" IS NULL))),
	CONSTRAINT "media_objects_storage_check" CHECK ("media_objects"."storage" IN ('r2_social','r2_evidence','stream')),
	CONSTRAINT "media_objects_object_path_check" CHECK ("media_objects"."object_path" IS NULL OR "media_objects"."object_path" ~ '^/objects/ready/[0-9a-f-]{36}$'),
	CONSTRAINT "media_objects_stream_external_check" CHECK (("media_objects"."storage" = 'stream') = ("media_objects"."external_id" IS NOT NULL)),
	CONSTRAINT "media_objects_storage_path_check" CHECK (("media_objects"."storage" <> 'stream') = ("media_objects"."object_path" IS NOT NULL)),
	CONSTRAINT "media_objects_state_check" CHECK ("media_objects"."state" IN ('reserved','uploading','processing','ready','failed','deleting')),
	CONSTRAINT "media_objects_declared_bytes_check" CHECK ("media_objects"."declared_bytes" BETWEEN 1 AND 314572800),
	CONSTRAINT "media_objects_scan_check" CHECK ("media_objects"."scan" IN ('pending','clean','infected')),
	CONSTRAINT "media_objects_moderation_check" CHECK ("media_objects"."moderation" IN ('pending','clear','held','removed'))
);
--> statement-breakpoint
CREATE TABLE "media_renditions" (
	"media_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"object_path" text NOT NULL,
	"namespace" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" bigint,
	"state" text DEFAULT 'ready' NOT NULL,
	CONSTRAINT "media_renditions_pk" PRIMARY KEY("media_id","kind"),
	CONSTRAINT "media_renditions_kind_check" CHECK ("media_renditions"."kind" IN ('playback','audio','poster','transcript')),
	CONSTRAINT "media_renditions_object_path_check" CHECK ("media_renditions"."object_path" ~ '^/objects/ready/[0-9a-f-]{36}$'),
	CONSTRAINT "media_renditions_state_check" CHECK ("media_renditions"."state" IN ('ready','deleting'))
);
--> statement-breakpoint
CREATE TABLE "media_uploads" (
	"media_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_payload" text NOT NULL,
	"part_bytes" integer,
	"max_bytes" bigint,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "media_uploads_state_check" CHECK ("media_uploads"."state" IN ('open','completed','aborted','expired'))
);
--> statement-breakpoint
CREATE TABLE "community_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_blocks_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "community_blocks_not_self_check" CHECK ("community_blocks"."blocker_id" <> "community_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "community_post_details" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"quote_post_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_post_details_kind_check" CHECK ("community_post_details"."kind" IN ('post','routine','short','video'))
);
--> statement-breakpoint
CREATE TABLE "community_post_media" (
	"post_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"media_id" uuid NOT NULL,
	"alt" text,
	CONSTRAINT "community_post_media_pk" PRIMARY KEY("post_id","position"),
	CONSTRAINT "community_post_media_position_check" CHECK ("community_post_media"."position" BETWEEN 0 AND 3),
	CONSTRAINT "community_post_media_alt_check" CHECK ("community_post_media"."alt" IS NULL OR char_length("community_post_media"."alt") <= 500)
);
--> statement-breakpoint
CREATE TABLE "community_post_topics" (
	"post_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "community_post_topics_pk" PRIMARY KEY("post_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "community_reposts" (
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reposts_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "community_routines" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"author_id" uuid NOT NULL,
	"day" date NOT NULL,
	"items" jsonb NOT NULL,
	"minutes" integer NOT NULL,
	CONSTRAINT "community_routines_items_size_check" CHECK (octet_length("community_routines"."items"::text) <= 4096),
	CONSTRAINT "community_routines_items_array_check" CHECK (jsonb_typeof("community_routines"."items") = 'array' AND jsonb_array_length("community_routines"."items") <= 12),
	CONSTRAINT "community_routines_minutes_check" CHECK ("community_routines"."minutes" BETWEEN 0 AND 1440)
);
--> statement-breakpoint
CREATE TABLE "community_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_topics_slug_check" CHECK ("community_topics"."slug" ~ '^[a-z0-9][a-z0-9_]{1,49}$'),
	CONSTRAINT "community_topics_status_check" CHECK ("community_topics"."status" IN ('active','blocked'))
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"state" text DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_reports_target_type_check" CHECK ("content_reports"."target_type" IN ('post','comment','media','profile','job','job_check')),
	CONSTRAINT "content_reports_reason_check" CHECK ("content_reports"."reason" IN ('illegal','sexual','child_safety','harassment','hate','violence','spam','impersonation','privacy','intellectual_property','cheating','other')),
	CONSTRAINT "content_reports_details_check" CHECK ("content_reports"."details" IS NULL OR char_length("content_reports"."details") <= 2000),
	CONSTRAINT "content_reports_state_check" CHECK ("content_reports"."state" IN ('open','triaged','actioned','dismissed'))
);
--> statement-breakpoint
CREATE TABLE "content_restrictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason_code" text NOT NULL,
	"actor_id" uuid,
	"report_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	CONSTRAINT "content_restrictions_action_check" CHECK ("content_restrictions"."action" IN ('hidden','removed'))
);
--> statement-breakpoint
CREATE TABLE "content_suspensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"actor_id" uuid,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_content_org_id_organizations_id_fk" FOREIGN KEY ("content_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_renditions" ADD CONSTRAINT "media_renditions_media_id_media_objects_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_media_id_media_objects_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_blocks" ADD CONSTRAINT "community_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_blocks" ADD CONSTRAINT "community_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_details" ADD CONSTRAINT "community_post_details_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_details" ADD CONSTRAINT "community_post_details_quote_post_id_community_posts_id_fk" FOREIGN KEY ("quote_post_id") REFERENCES "public"."community_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_media" ADD CONSTRAINT "community_post_media_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_media" ADD CONSTRAINT "community_post_media_media_id_media_objects_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_topics" ADD CONSTRAINT "community_post_topics_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_topics" ADD CONSTRAINT "community_post_topics_topic_id_community_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."community_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reposts" ADD CONSTRAINT "community_reposts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reposts" ADD CONSTRAINT "community_reposts_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_routines" ADD CONSTRAINT "community_routines_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_routines" ADD CONSTRAINT "community_routines_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_restrictions" ADD CONSTRAINT "content_restrictions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_restrictions" ADD CONSTRAINT "content_restrictions_report_id_content_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."content_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_restrictions" ADD CONSTRAINT "content_restrictions_lifted_by_users_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suspensions" ADD CONSTRAINT "content_suspensions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suspensions" ADD CONSTRAINT "content_suspensions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_cleanup_provider_external_unique" ON "media_cleanup_jobs" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "media_cleanup_state_available_idx" ON "media_cleanup_jobs" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "media_objects_owner_created_idx" ON "media_objects" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "media_objects_content_org_idx" ON "media_objects" USING btree ("content_org_id");--> statement-breakpoint
CREATE INDEX "media_objects_created_by_idx" ON "media_objects" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "media_objects_state_expiry_idx" ON "media_objects" USING btree ("state","upload_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_objects_external_id_unique" ON "media_objects" USING btree ("external_id") WHERE "media_objects"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_objects_object_path_unique" ON "media_objects" USING btree ("object_path") WHERE "media_objects"."object_path" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_renditions_object_path_unique" ON "media_renditions" USING btree ("object_path");--> statement-breakpoint
CREATE INDEX "community_blocks_blocked_idx" ON "community_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "community_post_details_kind_created_idx" ON "community_post_details" USING btree ("kind","created_at","post_id");--> statement-breakpoint
CREATE INDEX "community_post_details_quote_post_idx" ON "community_post_details" USING btree ("quote_post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_post_media_media_unique" ON "community_post_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "community_post_topics_topic_post_idx" ON "community_post_topics" USING btree ("topic_id","post_id");--> statement-breakpoint
CREATE INDEX "community_reposts_post_idx" ON "community_reposts" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "community_reposts_user_created_idx" ON "community_reposts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "community_routines_author_day_unique" ON "community_routines" USING btree ("author_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "community_topics_slug_unique" ON "community_topics" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_open_reporter_target_unique" ON "content_reports" USING btree ("reporter_id","target_type","target_id") WHERE "content_reports"."state" = 'open';--> statement-breakpoint
CREATE INDEX "content_reports_reporter_idx" ON "content_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "content_reports_handler_idx" ON "content_reports" USING btree ("handled_by");--> statement-breakpoint
CREATE INDEX "content_reports_state_due_idx" ON "content_reports" USING btree ("state","due_at");--> statement-breakpoint
CREATE INDEX "content_reports_target_idx" ON "content_reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_restrictions_active_target_unique" ON "content_restrictions" USING btree ("target_type","target_id") WHERE "content_restrictions"."lifted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "content_restrictions_target_idx" ON "content_restrictions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "content_restrictions_actor_idx" ON "content_restrictions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "content_restrictions_report_idx" ON "content_restrictions" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "content_restrictions_lifted_by_idx" ON "content_restrictions" USING btree ("lifted_by");--> statement-breakpoint
CREATE INDEX "content_suspensions_user_ends_idx" ON "content_suspensions" USING btree ("user_id","ends_at");--> statement-breakpoint
CREATE INDEX "content_suspensions_actor_idx" ON "content_suspensions" USING btree ("actor_id");