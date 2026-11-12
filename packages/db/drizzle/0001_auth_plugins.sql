CREATE TABLE "ssoProvider" (
  "id" text PRIMARY KEY,
  "issuer" text NOT NULL,
  "oidcConfig" text,
  "samlConfig" text,
  "userId" text,
  "providerId" text NOT NULL UNIQUE,
  "organizationId" text,
  "domain" text NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "scimManagedConnection" (
  "id" text PRIMARY KEY,
  "creationRequestId" text NOT NULL UNIQUE,
  "connectionId" text NOT NULL UNIQUE,
  "provisioningDomainId" text NOT NULL,
  "status" text NOT NULL,
  "revision" integer NOT NULL,
  "createdAt" timestamp NOT NULL,
  "createdBy" text NOT NULL,
  "decommissionStartedAt" timestamp,
  "decommissionStartedBy" text,
  "decommissionedAt" timestamp,
  "decommissionedBy" text
);
--> statement-breakpoint
CREATE INDEX "scimManagedConnection_provisioningDomainId_idx" ON "scimManagedConnection" ("provisioningDomainId");
--> statement-breakpoint
CREATE TABLE "scimManagedCredential" (
  "id" text PRIMARY KEY,
  "connectionRecordId" text NOT NULL,
  "credentialId" text NOT NULL UNIQUE,
  "tokenDigest" text NOT NULL,
  "hashVersion" text NOT NULL,
  "activeSlotKey" text NOT NULL UNIQUE,
  "status" text NOT NULL,
  "serializedScopes" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL,
  "createdBy" text NOT NULL,
  "lastUsedAt" timestamp,
  "revokedAt" timestamp,
  "revokedBy" text,
  "decommissionedAt" timestamp,
  FOREIGN KEY ("connectionRecordId") REFERENCES "scimManagedConnection" ("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "scimManagedCredential_connectionRecordId_idx" ON "scimManagedCredential" ("connectionRecordId");
--> statement-breakpoint
CREATE TABLE "scimManagedConnectionEvent" (
  "id" text PRIMARY KEY,
  "connectionRecordId" text NOT NULL,
  "eventKey" text NOT NULL UNIQUE,
  "sequence" integer NOT NULL,
  "type" text NOT NULL,
  "actorId" text NOT NULL,
  "credentialId" text,
  "createdAt" timestamp NOT NULL,
  FOREIGN KEY ("connectionRecordId") REFERENCES "scimManagedConnection" ("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "scimManagedConnectionEvent_connectionRecordId_idx" ON "scimManagedConnectionEvent" ("connectionRecordId");
--> statement-breakpoint
CREATE TABLE "scimConnectionBinding" (
  "id" text PRIMARY KEY,
  "connectionId" text NOT NULL,
  "connectionKey" text NOT NULL UNIQUE,
  "provisioningDomainId" text NOT NULL,
  "createdAt" timestamp NOT NULL,
  "decommissionedAt" timestamp,
  "decommissionStatus" text NOT NULL DEFAULT 'active',
  "decommissionCursorUserId" text,
  "decommissionReconciledUserCount" integer NOT NULL DEFAULT 0,
  "decommissionBatchCount" integer NOT NULL DEFAULT 0,
  "decommissionRevision" integer NOT NULL DEFAULT 0,
  "decommissionCompletedAt" timestamp,
  "decommissionLeaseId" text,
  "decommissionLeaseExpiresAt" timestamp
);
--> statement-breakpoint
CREATE INDEX "scimConnectionBinding_connectionId_idx" ON "scimConnectionBinding" ("connectionId");
--> statement-breakpoint
CREATE TABLE "scimIdentityTombstone" (
  "id" text PRIMARY KEY,
  "connectionId" text NOT NULL,
  "provisioningDomainId" text NOT NULL,
  "externalId" text NOT NULL,
  "externalIdKey" text NOT NULL UNIQUE,
  "userId" text NOT NULL,
  "profile" text NOT NULL,
  "deletedAt" timestamp NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "scimIdentityTombstone_connectionId_idx" ON "scimIdentityTombstone" ("connectionId");
--> statement-breakpoint
CREATE INDEX "scimIdentityTombstone_provisioningDomainId_idx" ON "scimIdentityTombstone" ("provisioningDomainId");
--> statement-breakpoint
CREATE INDEX "scimIdentityTombstone_userId_idx" ON "scimIdentityTombstone" ("userId");
--> statement-breakpoint
CREATE TABLE "scimSubject" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL UNIQUE,
  "profileSourceId" text,
  "revision" integer NOT NULL,
  "createdAt" timestamp NOT NULL,
  "updatedAt" timestamp NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "scimSubject_profileSourceId_idx" ON "scimSubject" ("profileSourceId");
--> statement-breakpoint
CREATE TABLE "scimUser" (
  "id" text PRIMARY KEY,
  "connectionId" text NOT NULL,
  "provisioningDomainId" text NOT NULL,
  "userId" text NOT NULL,
  "connectionUserKey" text NOT NULL UNIQUE,
  "userName" text NOT NULL,
  "userNameKey" text NOT NULL UNIQUE,
  "primaryEmail" text NOT NULL,
  "workEmailValueIndex" text NOT NULL,
  "emailValueIndex" text NOT NULL,
  "displayName" text NOT NULL,
  "formattedName" text NOT NULL,
  "givenName" text,
  "familyName" text,
  "serializedEmails" text NOT NULL,
  "serializedAttributes" text,
  "externalId" text,
  "externalIdKey" text UNIQUE,
  "active" boolean NOT NULL,
  "orderKey" text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL,
  "updatedAt" timestamp NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "scimUser_connectionId_idx" ON "scimUser" ("connectionId");
--> statement-breakpoint
CREATE INDEX "scimUser_provisioningDomainId_idx" ON "scimUser" ("provisioningDomainId");
--> statement-breakpoint
CREATE INDEX "scimUser_userId_idx" ON "scimUser" ("userId");
--> statement-breakpoint
CREATE TABLE "scimProjectionGrant" (
  "id" text PRIMARY KEY,
  "connectionId" text NOT NULL,
  "provisioningDomainId" text NOT NULL,
  "scimUserId" text NOT NULL,
  "userId" text NOT NULL,
  "sourceKind" text NOT NULL,
  "sourceId" text NOT NULL,
  "sourceValue" text,
  "role" text NOT NULL,
  "grantKey" text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL,
  "updatedAt" timestamp NOT NULL,
  FOREIGN KEY ("scimUserId") REFERENCES "scimUser" ("id") ON DELETE cascade,
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "scimProjectionGrant_connectionId_idx" ON "scimProjectionGrant" ("connectionId");
--> statement-breakpoint
CREATE INDEX "scimProjectionGrant_provisioningDomainId_idx" ON "scimProjectionGrant" ("provisioningDomainId");
--> statement-breakpoint
CREATE INDEX "scimProjectionGrant_scimUserId_idx" ON "scimProjectionGrant" ("scimUserId");
--> statement-breakpoint
CREATE INDEX "scimProjectionGrant_userId_idx" ON "scimProjectionGrant" ("userId");
--> statement-breakpoint
CREATE TABLE "scimGroup" (
  "id" text PRIMARY KEY,
  "connectionId" text NOT NULL,
  "provisioningDomainId" text NOT NULL,
  "revision" integer NOT NULL DEFAULT 0,
  "displayName" text NOT NULL,
  "displayNameKey" text NOT NULL UNIQUE,
  "externalId" text,
  "externalIdKey" text UNIQUE,
  "orderKey" text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL,
  "updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "scimGroup_connectionId_idx" ON "scimGroup" ("connectionId");
--> statement-breakpoint
CREATE INDEX "scimGroup_provisioningDomainId_idx" ON "scimGroup" ("provisioningDomainId");
--> statement-breakpoint
CREATE TABLE "scimGroupMember" (
  "id" text PRIMARY KEY,
  "connectionId" text NOT NULL,
  "groupId" text NOT NULL,
  "scimUserId" text NOT NULL,
  "membershipKey" text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL,
  FOREIGN KEY ("groupId") REFERENCES "scimGroup" ("id") ON DELETE cascade,
  FOREIGN KEY ("scimUserId") REFERENCES "scimUser" ("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "scimGroupMember_connectionId_idx" ON "scimGroupMember" ("connectionId");
--> statement-breakpoint
CREATE INDEX "scimGroupMember_groupId_idx" ON "scimGroupMember" ("groupId");
--> statement-breakpoint
CREATE INDEX "scimGroupMember_scimUserId_idx" ON "scimGroupMember" ("scimUserId");
