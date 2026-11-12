CREATE TABLE "org_settings" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL DEFAULT '',
  "base_domain" text NOT NULL DEFAULT '',
  "preview_domain" text NOT NULL DEFAULT '',
  "logo_url" text,
  "brand_color" text,
  "signup_mode" text NOT NULL DEFAULT 'invite',
  "retention_days" integer NOT NULL DEFAULT 365,
  "configured_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "org_settings" ("id") VALUES ('org');
--> statement-breakpoint
CREATE TABLE "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "org_role" text NOT NULL DEFAULT 'none',
  "org_role_source" text NOT NULL DEFAULT 'none',
  "disabled_at" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE "auth_account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "account" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "membership" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL REFERENCES "account"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "source" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "membership_account_user" ON "membership" ("account_id", "user_id");
--> statement-breakpoint
CREATE TABLE "invitation" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL REFERENCES "account"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "idp_group_mapping" (
  "id" text PRIMARY KEY,
  "provider_id" text NOT NULL,
  "group_external_id" text NOT NULL,
  "group_display" text NOT NULL DEFAULT '',
  "target" text NOT NULL,
  "role" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idp_group_provider_group" ON "idp_group_mapping" ("provider_id", "group_external_id", "target");
--> statement-breakpoint
CREATE TABLE "site" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL REFERENCES "account"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "source_url" text,
  "current_snapshot_id" text,
  "status" text NOT NULL DEFAULT 'importing',
  "analytics_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "snapshot" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "parent_snapshot_id" text,
  "kind" text NOT NULL,
  "storage_prefix" text NOT NULL,
  "file_count" integer NOT NULL DEFAULT 0,
  "bytes" integer NOT NULL DEFAULT 0,
  "created_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_current_snapshot_fk" FOREIGN KEY ("current_snapshot_id") REFERENCES "snapshot"("id");
--> statement-breakpoint
CREATE TABLE "site_domain" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "hostname" text NOT NULL UNIQUE,
  "is_primary" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'pending',
  "records" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "cloudfront_tenant_id" text,
  "last_checked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "import_run" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "source_url" text NOT NULL,
  "status" text NOT NULL,
  "options" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "stats" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fidelity_report" jsonb,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "site_redirect" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "from_path" text NOT NULL,
  "to_path" text NOT NULL,
  "code" integer NOT NULL DEFAULT 301,
  "source" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "site_redirect_from" ON "site_redirect" ("site_id", "from_path");
--> statement-breakpoint
CREATE TABLE "thread" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "created_by" text REFERENCES "user"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message" (
  "id" text PRIMARY KEY,
  "thread_id" text NOT NULL REFERENCES "thread"("id") ON DELETE CASCADE,
  "author" text NOT NULL,
  "user_id" text REFERENCES "user"("id"),
  "body" text NOT NULL,
  "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "message_thread_idx" ON "message" ("thread_id");
--> statement-breakpoint
CREATE TABLE "change_request" (
  "id" text PRIMARY KEY,
  "thread_id" text NOT NULL REFERENCES "thread"("id") ON DELETE CASCADE,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "source_snapshot_id" text,
  "result_snapshot_id" text,
  "hold_reason" text,
  "summary" text,
  "usage" jsonb,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "preview_session" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "change_request_id" text REFERENCES "change_request"("id") ON DELETE CASCADE,
  "snapshot_id" text NOT NULL REFERENCES "snapshot"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'ready',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "publish_event" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "from_snapshot_id" text,
  "to_snapshot_id" text NOT NULL,
  "actor_user_id" text,
  "kind" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_form" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "form_key" text NOT NULL,
  "name" text NOT NULL,
  "notify_emails" text[] NOT NULL DEFAULT '{}',
  "webhook_url" text,
  "webhook_secret" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lead_form_site_key" ON "lead_form" ("site_id", "form_key");
--> statement-breakpoint
CREATE TABLE "form_submission" (
  "id" text PRIMARY KEY,
  "lead_form_id" text NOT NULL REFERENCES "lead_form"("id") ON DELETE CASCADE,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "fields" jsonb NOT NULL,
  "ip_hash" text,
  "user_agent" text,
  "status" text NOT NULL DEFAULT 'stored',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "analytics_event" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "path" text NOT NULL,
  "referrer" text,
  "visitor_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "analytics_event_created_idx" ON "analytics_event" ("created_at");
--> statement-breakpoint
CREATE TABLE "analytics_daily" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "day" text NOT NULL,
  "path" text NOT NULL,
  "pageviews" integer NOT NULL DEFAULT 0,
  "visitors" integer NOT NULL DEFAULT 0,
  "top_referrers" jsonb NOT NULL DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_key" ON "analytics_daily" ("site_id", "day", "path");
--> statement-breakpoint
CREATE TABLE "audit_log" (
  "id" text PRIMARY KEY,
  "actor" text,
  "action" text NOT NULL,
  "target" text,
  "data" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rate_bucket" (
  "key" text PRIMARY KEY,
  "tokens" integer NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
