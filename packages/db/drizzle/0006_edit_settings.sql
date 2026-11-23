-- How many page files one change may edit by hand. Default matches
-- packages/config/src/edit-settings.ts. Not an environment variable.
CREATE TABLE "edit_settings" (
  "id" text PRIMARY KEY,
  "hand_edit_page_limit" integer NOT NULL DEFAULT 8,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" text
);
--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "tool_log" jsonb NOT NULL DEFAULT '[]'::jsonb;
