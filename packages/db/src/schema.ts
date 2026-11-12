import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const orgSettings = pgTable("org_settings", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  baseDomain: text("base_domain").notNull().default(""),
  previewDomain: text("preview_domain").notNull().default(""),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color"),
  signupMode: text("signup_mode").notNull().default("invite"),
  retentionDays: integer("retention_days").notNull().default(365),
  configuredAt: ts("configured_at"),
  updatedAt: ts("updated_at").notNull().defaultNow()
});

/**
 * Better Auth user, plus organization role.
 * Column names follow Better Auth's default camelCase fields so the adapter
 * can read the table without a custom map. org_role is an additional field.
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  org_role: text("org_role").notNull().default("none"),
  org_role_source: text("org_role_source").notNull().default("none"),
  disabledAt: ts("disabled_at"),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt").notNull().defaultNow()
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
});

/** Credential and SSO account rows. Named auth_account so `account` stays the domain. */
export const authAccount = pgTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: ts("accessTokenExpiresAt"),
  refreshTokenExpiresAt: ts("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt").notNull().defaultNow()
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expiresAt").notNull(),
  createdAt: ts("createdAt").defaultNow(),
  updatedAt: ts("updatedAt").defaultNow()
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  monthlyBudgetUsd: integer("monthly_budget_usd"),
  budgetAlertMonth: text("budget_alert_month"),
  archivedAt: ts("archived_at"),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const membership = pgTable(
  "membership",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    source: text("source").notNull(),
    createdAt: ts("created_at").notNull().defaultNow()
  },
  (table) => [uniqueIndex("membership_account_user").on(table.accountId, table.userId)]
);

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => account.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const site = pgTable("site", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => account.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sourceUrl: text("source_url"),
  currentSnapshotId: text("current_snapshot_id"),
  draftSnapshotId: text("draft_snapshot_id"),
  draftLockedBy: text("draft_locked_by"),
  draftLockedAt: ts("draft_locked_at"),
  status: text("status").notNull().default("importing"),
  analyticsEnabled: boolean("analytics_enabled").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const snapshot = pgTable("snapshot", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" }),
  parentSnapshotId: text("parent_snapshot_id"),
  kind: text("kind").notNull(),
  storagePrefix: text("storage_prefix").notNull(),
  fileCount: integer("file_count").notNull().default(0),
  bytes: integer("bytes").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const siteDomain = pgTable("site_domain", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  isPrimary: boolean("is_primary").notNull().default(false),
  status: text("status").notNull().default("pending"),
  records: jsonb("records")
    .notNull()
    .default(sql`'[]'::jsonb`),
  cloudfrontTenantId: text("cloudfront_tenant_id"),
  lastCheckedAt: ts("last_checked_at"),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const importRun = pgTable("import_run", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  status: text("status").notNull(),
  options: jsonb("options")
    .notNull()
    .default(sql`'{}'::jsonb`),
  stats: jsonb("stats")
    .notNull()
    .default(sql`'{}'::jsonb`),
  fidelityReport: jsonb("fidelity_report"),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow()
});

export const siteRedirect = pgTable(
  "site_redirect",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
    code: integer("code").notNull().default(301),
    source: text("source").notNull()
  },
  (table) => [uniqueIndex("site_redirect_from").on(table.siteId, table.fromPath)]
);

export const thread = pgTable("thread", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("open"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow()
});

export const message = pgTable("message", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => thread.id, { onDelete: "cascade" }),
  author: text("author").notNull(),
  userId: text("user_id").references(() => user.id),
  body: text("body").notNull(),
  attachments: jsonb("attachments")
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const changeRequest = pgTable("change_request", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => thread.id, { onDelete: "cascade" }),
  siteId: text("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  sourceSnapshotId: text("source_snapshot_id"),
  resultSnapshotId: text("result_snapshot_id"),
  holdReason: text("hold_reason"),
  summary: text("summary"),
  usage: jsonb("usage"),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow()
});

export const previewSession = pgTable("preview_session", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" }),
  changeRequestId: text("change_request_id").references(() => changeRequest.id, {
    onDelete: "cascade"
  }),
  snapshotId: text("snapshot_id")
    .notNull()
    .references(() => snapshot.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  status: text("status").notNull().default("ready"),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const publishEvent = pgTable("publish_event", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" }),
  fromSnapshotId: text("from_snapshot_id"),
  toSnapshotId: text("to_snapshot_id").notNull(),
  actorUserId: text("actor_user_id"),
  kind: text("kind").notNull(),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const leadForm = pgTable(
  "lead_form",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    formKey: text("form_key").notNull(),
    name: text("name").notNull(),
    notifyEmails: text("notify_emails")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    webhookUrl: text("webhook_url"),
    webhookSecret: text("webhook_secret"),
    createdAt: ts("created_at").notNull().defaultNow()
  },
  (table) => [uniqueIndex("lead_form_site_key").on(table.siteId, table.formKey)]
);

export const formSubmission = pgTable("form_submission", {
  id: text("id").primaryKey(),
  leadFormId: text("lead_form_id")
    .notNull()
    .references(() => leadForm.id, { onDelete: "cascade" }),
  siteId: text("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" }),
  fields: jsonb("fields").notNull(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  status: text("status").notNull().default("stored"),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const analyticsEvent = pgTable("analytics_event", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  referrer: text("referrer"),
  visitorHash: text("visitor_hash").notNull(),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const analyticsDaily = pgTable(
  "analytics_daily",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    path: text("path").notNull(),
    pageviews: integer("pageviews").notNull().default(0),
    visitors: integer("visitors").notNull().default(0),
    topReferrers: jsonb("top_referrers")
      .notNull()
      .default(sql`'[]'::jsonb`)
  },
  (table) => [uniqueIndex("analytics_daily_key").on(table.siteId, table.day, table.path)]
);

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  actor: text("actor"),
  action: text("action").notNull(),
  target: text("target"),
  data: jsonb("data"),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const rateBucket = pgTable("rate_bucket", {
  key: text("key").primaryKey(),
  tokens: integer("tokens").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow()
});
