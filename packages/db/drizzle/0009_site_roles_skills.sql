-- Per-site roles, account skills, and skill history.
-- Account skills are rows because they apply to every site, not one snapshot.
CREATE TABLE "site_membership" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "site_membership_site_user" ON "site_membership" ("site_id", "user_id");
--> statement-breakpoint
CREATE TABLE "account_skill" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL REFERENCES "account"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_skill_account_slug" ON "account_skill" ("account_id", "slug");
--> statement-breakpoint
CREATE TABLE "skill_revision" (
  "id" text PRIMARY KEY,
  "account_id" text REFERENCES "account"("id") ON DELETE CASCADE,
  "site_id" text REFERENCES "site"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "actor_user_id" text,
  "action" text NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "site_id" text REFERENCES "site"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "person_name" text;
