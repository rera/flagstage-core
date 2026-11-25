-- Page and asset caps, and which installed importers are off.
-- Defaults match packages/config/src/importer-settings.ts.
-- Not environment variables.
ALTER TABLE "importer_settings" ADD COLUMN "max_pages" integer NOT NULL DEFAULT 5000;
--> statement-breakpoint
ALTER TABLE "importer_settings" ADD COLUMN "max_assets" integer NOT NULL DEFAULT 20000;
--> statement-breakpoint
ALTER TABLE "importer_settings" ADD COLUMN "disabled_importers" jsonb NOT NULL DEFAULT '[]'::jsonb;
