ALTER TABLE "account" ADD COLUMN "monthly_budget_usd" integer;
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "budget_alert_month" text;
--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "draft_snapshot_id" text;
--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "draft_locked_by" text;
--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "draft_locked_at" timestamptz;
