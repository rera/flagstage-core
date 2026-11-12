ALTER TABLE "import_run" ADD COLUMN "correlation_id" text;
--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "correlation_id" text;
--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "correlation_id" text;
--> statement-breakpoint
CREATE INDEX "import_run_correlation" ON "import_run" ("correlation_id");
--> statement-breakpoint
CREATE INDEX "change_request_correlation" ON "change_request" ("correlation_id");
