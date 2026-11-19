CREATE TABLE "ai_budgets" (
	"scope" text NOT NULL,
	"period" text NOT NULL,
	"limit_micros" bigint NOT NULL,
	"reserved_micros" bigint DEFAULT 0 NOT NULL,
	"spent_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_budgets_pk" PRIMARY KEY("scope","period"),
	CONSTRAINT "ai_budgets_amounts_check" CHECK ("ai_budgets"."limit_micros" >= 0 AND "ai_budgets"."reserved_micros" >= 0 AND "ai_budgets"."spent_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"scope_org_id" uuid,
	"ref_type" text,
	"ref_id" uuid,
	"model" text,
	"prompt_version" text,
	"input_units" bigint DEFAULT 0 NOT NULL,
	"output_units" bigint DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_purpose_check" CHECK ("ai_usage"."purpose" IN ('grading','interview','transcription','speech','drafting','moderation','calibration','screening')),
	CONSTRAINT "ai_usage_status_check" CHECK ("ai_usage"."status" IN ('reserved','ok','failed','unknown'))
);
--> statement-breakpoint
CREATE TABLE "entitlement_uses" (
	"entitlement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_uses_pk" PRIMARY KEY("entitlement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"feature" text NOT NULL,
	"seats" integer,
	"seats_used" integer DEFAULT 0 NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"external_ref" text,
	"granted_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_holder_check" CHECK (num_nonnulls("entitlements"."user_id", "entitlements"."organization_id") = 1),
	CONSTRAINT "entitlements_feature_check" CHECK ("entitlements"."feature" IN ('skills.premium','skills.seats','skills.org_authoring','education.cohorts')),
	CONSTRAINT "entitlements_seats_check" CHECK ("entitlements"."seats" > 0),
	CONSTRAINT "entitlements_seats_used_check" CHECK ("entitlements"."seats_used" >= 0),
	CONSTRAINT "entitlements_seats_limit_check" CHECK ("entitlements"."seats" IS NULL OR "entitlements"."seats_used" <= "entitlements"."seats"),
	CONSTRAINT "entitlements_seats_holder_check" CHECK ("entitlements"."seats" IS NULL OR "entitlements"."organization_id" IS NOT NULL),
	CONSTRAINT "entitlements_window_check" CHECK ("entitlements"."ends_at" > "entitlements"."starts_at"),
	CONSTRAINT "entitlements_source_check" CHECK ("entitlements"."source" IN ('comp','invoice','purchase'))
);
--> statement-breakpoint
CREATE TABLE "hook_receipts" (
	"event_hash" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hook_receipts_source_check" CHECK ("hook_receipts"."source" IN ('video','mail')),
	CONSTRAINT "hook_receipts_status_check" CHECK ("hook_receipts"."status" IN ('accepted','ignored'))
);
--> statement-breakpoint
CREATE TABLE "mail_suppressions" (
	"email_digest" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_suppressions_reason_check" CHECK ("mail_suppressions"."reason" IN ('bounce','complaint','manual'))
);
--> statement-breakpoint
CREATE TABLE "organization_accounts" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'community' NOT NULL,
	"verification" text DEFAULT 'unverified' NOT NULL,
	"legal_name" text,
	"website_domain" text,
	"verified_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"domain_proof_digest" text,
	"evidence_note" text,
	"requested_by" uuid,
	"requested_at" timestamp with time zone,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_accounts_kind_check" CHECK ("organization_accounts"."kind" IN ('company','college','community')),
	CONSTRAINT "organization_accounts_verification_check" CHECK ("organization_accounts"."verification" IN ('unverified','pending','verified','rejected','suspended')),
	CONSTRAINT "organization_accounts_evidence_check" CHECK (char_length("organization_accounts"."evidence_note") <= 1000),
	CONSTRAINT "organization_accounts_verified_check" CHECK ("organization_accounts"."verification" <> 'verified' OR ("organization_accounts"."verified_at" IS NOT NULL AND "organization_accounts"."legal_name" IS NOT NULL AND "organization_accounts"."kind" <> 'community'))
);
--> statement-breakpoint
CREATE TABLE "organization_member_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"granted_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_member_grants_capability_check" CHECK ("organization_member_grants"."capability" IN ('skills.organization.author','skills.organization.assign','skills.organization.results','skills.organization.grade','education.cohort.manage'))
);
--> statement-breakpoint
CREATE TABLE "platform_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"source" text DEFAULT 'grant' NOT NULL,
	"reason" text NOT NULL,
	"granted_by" uuid,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_grants_capability_check" CHECK ("platform_grants"."capability" IN ('skills.author','skills.publisher','skills.grader','skills.adjudicator','skills.integrity')),
	CONSTRAINT "platform_grants_source_check" CHECK ("platform_grants"."source" IN ('grant','break_glass')),
	CONSTRAINT "platform_grants_reason_check" CHECK (char_length("platform_grants"."reason") BETWEEN 3 AND 500),
	CONSTRAINT "platform_grants_self_check" CHECK ("platform_grants"."granted_by" IS NULL OR "platform_grants"."granted_by" <> "platform_grants"."user_id")
);
--> statement-breakpoint
CREATE TABLE "skill_ledger_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"entries_through" bigint NOT NULL,
	"chain_count" integer NOT NULL,
	"merkle_root" text NOT NULL,
	"signature" text NOT NULL,
	"key_id" text NOT NULL,
	"anchor_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain" text NOT NULL,
	"seq" integer NOT NULL,
	"prev_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"type" text NOT NULL,
	"actor_ref" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_ledger_chain_check" CHECK ("skill_ledger"."chain" ~ '^(access|content|grading|moderation|attempt:[0-9a-f-]{36})$'),
	CONSTRAINT "skill_ledger_seq_check" CHECK ("skill_ledger"."seq" > 0),
	CONSTRAINT "skill_ledger_type_check" CHECK ("skill_ledger"."type" ~ '^[a-z][a-z0-9_.]{2,60}$'),
	CONSTRAINT "skill_ledger_payload_check" CHECK (octet_length("skill_ledger"."payload"::text) <= 8192)
);
--> statement-breakpoint
CREATE TABLE "work_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"ref_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sealed_payload" text,
	"key_id" text,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_id" uuid,
	"lease_until" timestamp with time zone,
	"provider_started_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "work_jobs_kind_check" CHECK ("work_jobs"."kind" ~ '^[a-z][a-z0-9-]{2,40}$'),
	CONSTRAINT "work_jobs_payload_check" CHECK (octet_length("work_jobs"."payload"::text) <= 8192),
	CONSTRAINT "work_jobs_state_check" CHECK ("work_jobs"."state" IN ('queued','running','done','failed','cancelled')),
	CONSTRAINT "work_jobs_attempts_check" CHECK ("work_jobs"."attempts" BETWEEN 0 AND 5)
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_scope_org_id_organizations_id_fk" FOREIGN KEY ("scope_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_uses" ADD CONSTRAINT "entitlement_uses_entitlement_id_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_uses" ADD CONSTRAINT "entitlement_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_accounts" ADD CONSTRAINT "organization_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_accounts" ADD CONSTRAINT "organization_accounts_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_accounts" ADD CONSTRAINT "organization_accounts_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_grants" ADD CONSTRAINT "organization_member_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_grants" ADD CONSTRAINT "organization_member_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_grants" ADD CONSTRAINT "organization_member_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_grants" ADD CONSTRAINT "platform_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_grants" ADD CONSTRAINT "platform_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_grants" ADD CONSTRAINT "platform_grants_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_purpose_idx" ON "ai_usage" USING btree ("purpose","started_at");--> statement-breakpoint
CREATE INDEX "ai_usage_ref_idx" ON "ai_usage" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "entitlements_user_idx" ON "entitlements" USING btree ("user_id","feature");--> statement-breakpoint
CREATE INDEX "entitlements_organization_idx" ON "entitlements" USING btree ("organization_id","feature");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_accounts_legal_name_unique" ON "organization_accounts" USING btree ("kind",lower("legal_name")) WHERE "organization_accounts"."verification" = 'verified';--> statement-breakpoint
CREATE INDEX "organization_accounts_kind_idx" ON "organization_accounts" USING btree ("kind","verification");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_member_grants_active_unique" ON "organization_member_grants" USING btree ("organization_id","user_id","capability") WHERE "organization_member_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "organization_member_grants_user_idx" ON "organization_member_grants" USING btree ("user_id") WHERE "organization_member_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_grants_active_unique" ON "platform_grants" USING btree ("user_id","capability") WHERE "platform_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "platform_grants_capability_idx" ON "platform_grants" USING btree ("capability") WHERE "platform_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_ledger_checkpoints_entries_unique" ON "skill_ledger_checkpoints" USING btree ("entries_through");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_ledger_entry_hash_unique" ON "skill_ledger" USING btree ("entry_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_ledger_chain_seq_unique" ON "skill_ledger" USING btree ("chain","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "work_jobs_dedupe_unique" ON "work_jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "work_jobs_queue_idx" ON "work_jobs" USING btree ("state","available_at","created_at");--> statement-breakpoint
CREATE INDEX "work_jobs_lease_idx" ON "work_jobs" USING btree ("state","lease_until");--> statement-breakpoint
-- System permission definitions only; never seed users or memberships.
-- Organization owners and admins receive the five keys. organization_member
-- receives nothing: a plain member gets a key through organization_member_grants.
INSERT INTO permissions(key,name,description) VALUES
 ('skills.organization.author','Author organization skill checks','Author the organization''s own private question sets and tests'),
 ('skills.organization.assign','Assign skill checks','Create assignments and invitations, open sittings and request accommodations'),
 ('skills.organization.results','Read shared skill check results','Read results that candidates consented to share with the organization'),
 ('skills.organization.grade','Grade organization skill checks','Grade responses to the organization''s own tests'),
 ('education.cohort.manage','Manage cohorts','Manage cohorts, rosters and invitations')
ON CONFLICT(key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.key IN('organization_owner','organization_admin')
 AND p.key IN('skills.organization.author','skills.organization.assign','skills.organization.results','skills.organization.grade','education.cohort.manage')
ON CONFLICT DO NOTHING;