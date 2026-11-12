import { user } from "./schema";
import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const ssoProvider = pgTable("ssoProvider", {
  id: text("id").primaryKey(),
  issuer: text("issuer").notNull(),
  oidcConfig: text("oidcConfig"),
  samlConfig: text("samlConfig"),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  providerId: text("providerId").notNull().unique(),
  organizationId: text("organizationId"),
  domain: text("domain").notNull()
});

export const scimManagedConnection = pgTable(
  "scimManagedConnection",
  {
    id: text("id").primaryKey(),
    creationRequestId: text("creationRequestId").notNull().unique(),
    connectionId: text("connectionId").notNull().unique(),
    provisioningDomainId: text("provisioningDomainId").notNull(),
    status: text("status").notNull(),
    revision: integer("revision").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    createdBy: text("createdBy").notNull(),
    decommissionStartedAt: timestamp("decommissionStartedAt"),
    decommissionStartedBy: text("decommissionStartedBy"),
    decommissionedAt: timestamp("decommissionedAt"),
    decommissionedBy: text("decommissionedBy")
  },
  (table) => [
    index("scimManagedConnection_provisioningDomainId_idx").on(table.provisioningDomainId)
  ]
);

export const scimManagedCredential = pgTable(
  "scimManagedCredential",
  {
    id: text("id").primaryKey(),
    connectionRecordId: text("connectionRecordId")
      .notNull()
      .references(() => scimManagedConnection.id, { onDelete: "cascade" }),
    credentialId: text("credentialId").notNull().unique(),
    tokenDigest: text("tokenDigest").notNull(),
    hashVersion: text("hashVersion").notNull(),
    activeSlotKey: text("activeSlotKey").notNull().unique(),
    status: text("status").notNull(),
    serializedScopes: text("serializedScopes").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    createdBy: text("createdBy").notNull(),
    lastUsedAt: timestamp("lastUsedAt"),
    revokedAt: timestamp("revokedAt"),
    revokedBy: text("revokedBy"),
    decommissionedAt: timestamp("decommissionedAt")
  },
  (table) => [index("scimManagedCredential_connectionRecordId_idx").on(table.connectionRecordId)]
);

export const scimManagedConnectionEvent = pgTable(
  "scimManagedConnectionEvent",
  {
    id: text("id").primaryKey(),
    connectionRecordId: text("connectionRecordId")
      .notNull()
      .references(() => scimManagedConnection.id, { onDelete: "cascade" }),
    eventKey: text("eventKey").notNull().unique(),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    actorId: text("actorId").notNull(),
    credentialId: text("credentialId"),
    createdAt: timestamp("createdAt").notNull()
  },
  (table) => [
    index("scimManagedConnectionEvent_connectionRecordId_idx").on(table.connectionRecordId)
  ]
);

export const scimConnectionBinding = pgTable(
  "scimConnectionBinding",
  {
    id: text("id").primaryKey(),
    connectionId: text("connectionId").notNull(),
    connectionKey: text("connectionKey").notNull().unique(),
    provisioningDomainId: text("provisioningDomainId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    decommissionedAt: timestamp("decommissionedAt"),
    decommissionStatus: text("decommissionStatus").default("active").notNull(),
    decommissionCursorUserId: text("decommissionCursorUserId"),
    decommissionReconciledUserCount: integer("decommissionReconciledUserCount")
      .default(0)
      .notNull(),
    decommissionBatchCount: integer("decommissionBatchCount").default(0).notNull(),
    decommissionRevision: integer("decommissionRevision").default(0).notNull(),
    decommissionCompletedAt: timestamp("decommissionCompletedAt"),
    decommissionLeaseId: text("decommissionLeaseId"),
    decommissionLeaseExpiresAt: timestamp("decommissionLeaseExpiresAt")
  },
  (table) => [index("scimConnectionBinding_connectionId_idx").on(table.connectionId)]
);

export const scimIdentityTombstone = pgTable(
  "scimIdentityTombstone",
  {
    id: text("id").primaryKey(),
    connectionId: text("connectionId").notNull(),
    provisioningDomainId: text("provisioningDomainId").notNull(),
    externalId: text("externalId").notNull(),
    externalIdKey: text("externalIdKey").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    profile: text("profile").notNull(),
    deletedAt: timestamp("deletedAt").notNull()
  },
  (table) => [
    index("scimIdentityTombstone_connectionId_idx").on(table.connectionId),
    index("scimIdentityTombstone_provisioningDomainId_idx").on(table.provisioningDomainId),
    index("scimIdentityTombstone_userId_idx").on(table.userId)
  ]
);

export const scimSubject = pgTable(
  "scimSubject",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    profileSourceId: text("profileSourceId"),
    revision: integer("revision").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull()
  },
  (table) => [index("scimSubject_profileSourceId_idx").on(table.profileSourceId)]
);

export const scimUser = pgTable(
  "scimUser",
  {
    id: text("id").primaryKey(),
    connectionId: text("connectionId").notNull(),
    provisioningDomainId: text("provisioningDomainId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionUserKey: text("connectionUserKey").notNull().unique(),
    userName: text("userName").notNull(),
    userNameKey: text("userNameKey").notNull().unique(),
    primaryEmail: text("primaryEmail").notNull(),
    workEmailValueIndex: text("workEmailValueIndex").notNull(),
    emailValueIndex: text("emailValueIndex").notNull(),
    displayName: text("displayName").notNull(),
    formattedName: text("formattedName").notNull(),
    givenName: text("givenName"),
    familyName: text("familyName"),
    serializedEmails: text("serializedEmails").notNull(),
    serializedAttributes: text("serializedAttributes"),
    externalId: text("externalId"),
    externalIdKey: text("externalIdKey").unique(),
    active: boolean("active").notNull(),
    orderKey: text("orderKey").notNull().unique(),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull()
  },
  (table) => [
    index("scimUser_connectionId_idx").on(table.connectionId),
    index("scimUser_provisioningDomainId_idx").on(table.provisioningDomainId),
    index("scimUser_userId_idx").on(table.userId)
  ]
);

export const scimProjectionGrant = pgTable(
  "scimProjectionGrant",
  {
    id: text("id").primaryKey(),
    connectionId: text("connectionId").notNull(),
    provisioningDomainId: text("provisioningDomainId").notNull(),
    scimUserId: text("scimUserId")
      .notNull()
      .references(() => scimUser.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceKind: text("sourceKind").notNull(),
    sourceId: text("sourceId").notNull(),
    sourceValue: text("sourceValue"),
    role: text("role").notNull(),
    grantKey: text("grantKey").notNull().unique(),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull()
  },
  (table) => [
    index("scimProjectionGrant_connectionId_idx").on(table.connectionId),
    index("scimProjectionGrant_provisioningDomainId_idx").on(table.provisioningDomainId),
    index("scimProjectionGrant_scimUserId_idx").on(table.scimUserId),
    index("scimProjectionGrant_userId_idx").on(table.userId)
  ]
);

export const scimGroup = pgTable(
  "scimGroup",
  {
    id: text("id").primaryKey(),
    connectionId: text("connectionId").notNull(),
    provisioningDomainId: text("provisioningDomainId").notNull(),
    revision: integer("revision").default(0).notNull(),
    displayName: text("displayName").notNull(),
    displayNameKey: text("displayNameKey").notNull().unique(),
    externalId: text("externalId"),
    externalIdKey: text("externalIdKey").unique(),
    orderKey: text("orderKey").notNull().unique(),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull()
  },
  (table) => [
    index("scimGroup_connectionId_idx").on(table.connectionId),
    index("scimGroup_provisioningDomainId_idx").on(table.provisioningDomainId)
  ]
);

export const scimGroupMember = pgTable(
  "scimGroupMember",
  {
    id: text("id").primaryKey(),
    connectionId: text("connectionId").notNull(),
    groupId: text("groupId")
      .notNull()
      .references(() => scimGroup.id, { onDelete: "cascade" }),
    scimUserId: text("scimUserId")
      .notNull()
      .references(() => scimUser.id, { onDelete: "cascade" }),
    membershipKey: text("membershipKey").notNull().unique(),
    createdAt: timestamp("createdAt").notNull()
  },
  (table) => [
    index("scimGroupMember_connectionId_idx").on(table.connectionId),
    index("scimGroupMember_groupId_idx").on(table.groupId),
    index("scimGroupMember_scimUserId_idx").on(table.scimUserId)
  ]
);
