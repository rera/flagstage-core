DROP TABLE IF EXISTS "scimGroupMember" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scimGroup" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scimProjectionGrant" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scimUser" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scimSubject" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scimIdentityTombstone" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scimConnectionBinding" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scimManagedConnectionEvent" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scimManagedCredential" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scimManagedConnection" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "ssoProvider" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "idp_group_mapping" CASCADE;
--> statement-breakpoint
UPDATE "user" SET org_role = 'admin' WHERE org_role = 'org_admin';
--> statement-breakpoint
UPDATE "membership" SET role = 'account_admin' WHERE role IN ('editor', 'reviewer');
