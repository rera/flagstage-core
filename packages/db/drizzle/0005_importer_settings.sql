-- Defaults match packages/config/src/importer-settings.ts.
-- Later knobs (fallback page size, redirect policy) are columns on this row.
CREATE TABLE "importer_settings" (
  "id" text PRIMARY KEY,
  "decision_model" jsonb NOT NULL DEFAULT '{"provider":"bedrock","modelId":"global.anthropic.claude-haiku-4-5-20251001-v1:0"}'::jsonb,
  "decision_enabled" boolean NOT NULL DEFAULT true,
  "decision_confidence_threshold" double precision NOT NULL DEFAULT 0.6,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" text
);
