ALTER TABLE "repositories" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "name" text;--> statement-breakpoint
-- Existing repositories take their project's owner and slug (slugs are unique).
UPDATE "repositories" r SET "owner_id"=p."owner_id","name"=p."slug" FROM "community_projects" p WHERE p."id"=r."project_id";--> statement-breakpoint
ALTER TABLE "repositories" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_owner_name_unique" ON "repositories" USING btree ("owner_id",lower("name"));--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repository_name_valid" CHECK ("repositories"."name" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$' AND "repositories"."name" !~* '[.]git$');
