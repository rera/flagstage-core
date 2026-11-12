ALTER TABLE "site" ADD COLUMN "time_zone" text NOT NULL DEFAULT 'UTC';
--> statement-breakpoint
CREATE TABLE "site_schedule" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "snapshot_id" text NOT NULL REFERENCES "snapshot"("id"),
  "publish_at" timestamptz NOT NULL,
  "revert_at" timestamptz,
  "revert_to_snapshot_id" text REFERENCES "snapshot"("id"),
  "status" text NOT NULL DEFAULT 'scheduled',
  "actor_user_id" text,
  "summary" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "site_schedule_due" ON "site_schedule" ("status", "publish_at");
