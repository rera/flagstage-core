import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { eq } from "drizzle-orm";
import {
  bindTransactionContext,
  currentDatabase,
  idpGroupMapping,
  user as userTable,
  type Database
} from "@flagstage/db";
import {
  applyReconcile,
  loadGrants,
  projectGroups,
  reconcileGrants,
  type OrgRole
} from "@flagstage/core";

import * as schema from "@flagstage/db";

const authTables = {
  user: schema.user,
  session: schema.session,
  verification: schema.verification,
  auth_account: schema.authAccount,
  ssoProvider: schema.ssoProvider,
  scimManagedConnection: schema.scimManagedConnection,
  scimManagedCredential: schema.scimManagedCredential,
  scimManagedConnectionEvent: schema.scimManagedConnectionEvent,
  scimConnectionBinding: schema.scimConnectionBinding,
  scimIdentityTombstone: schema.scimIdentityTombstone,
  scimSubject: schema.scimSubject,
  scimUser: schema.scimUser,
  scimProjectionGrant: schema.scimProjectionGrant,
  scimGroup: schema.scimGroup,
  scimGroupMember: schema.scimGroupMember
};

const MEMBERSHIP_ROLE = /^(account_admin|editor|reviewer)$/;

export type CreateAuthInput = {
  database: Database;
  secret: string;
  baseURL: string;
  emailAndPassword: boolean;
  trustedOrigins?: string[];
};

function groupIdsFromProfile(profile: Record<string, unknown>): string[] {
  const value = profile.groups;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function projectionFromRoles(roles: readonly string[]) {
  let orgRole: OrgRole = "none";
  const memberships: Array<{ accountId: string; role: "account_admin" | "editor" | "reviewer" }> =
    [];
  for (const role of roles) {
    if (role === "org:org_admin") {
      orgRole = "org_admin";
      continue;
    }
    const [kind, accountId, name] = role.split(":");
    if (kind === "account" && accountId && name && MEMBERSHIP_ROLE.test(name)) {
      memberships.push({
        accountId,
        role: name as "account_admin" | "editor" | "reviewer"
      });
    }
  }
  return { orgRole, memberships };
}

export function createAuth(input: CreateAuthInput) {
  const database = bindTransactionContext(input.database);
  const db = () => currentDatabase(database);
  return betterAuth({
    secret: input.secret,
    baseURL: input.baseURL,
    trustedOrigins: input.trustedOrigins,
    database: drizzleAdapter(database, {
      provider: "pg",
      camelCase: true,
      transaction: true,
      schema: authTables
    }),
    account: {
      modelName: "auth_account"
    },
    user: {
      additionalFields: {
        orgRole: {
          type: "string",
          required: false,
          defaultValue: "none",
          input: false,
          fieldName: "org_role"
        },
        orgRoleSource: {
          type: "string",
          required: false,
          defaultValue: "none",
          input: false,
          fieldName: "org_role_source"
        }
      }
    },
    emailAndPassword: {
      enabled: input.emailAndPassword
    },
    plugins: [
      sso({
        disableImplicitSignUp: false,
        provisionUserOnEveryLogin: true,
        provisionUser: async ({ user, userInfo, provider }) => {
          const groupIds = groupIdsFromProfile(userInfo);
          const mappings = await db()
            .select()
            .from(idpGroupMapping)
            .where(eq(idpGroupMapping.providerId, provider.providerId));
          const projected = projectGroups(
            provider.providerId,
            groupIds,
            mappings.map((row) => ({
              providerId: row.providerId,
              groupExternalId: row.groupExternalId,
              target: row.target,
              role: row.role
            }))
          );
          let current;
          try {
            current = await loadGrants(db(), user.id);
          } catch {
            current = {
              orgRole: "none" as const,
              orgRoleSource: "none" as const,
              disabled: false,
              memberships: []
            };
          }
          const result = reconcileGrants({
            source: "sso_claim",
            active: true,
            currentOrgRole: current.orgRole,
            currentOrgRoleSource: current.orgRoleSource,
            memberships: current.memberships,
            projected
          });
          await applyReconcile(db(), user.id, result);
        }
      }),
      scim({
        connections: [],
        managedConnections: {
          credentialHashSecret: input.secret
        },
        projection: {
          roles: {
            async map(source) {
              const ids = [source.source.externalId, source.source.id].filter(
                (value): value is string => Boolean(value)
              );
              const mappings = await db()
                .select()
                .from(idpGroupMapping)
                .where(eq(idpGroupMapping.providerId, source.connectionId));
              const roles = mappings
                .filter((row) => ids.includes(row.groupExternalId))
                .map((row) =>
                  row.target === "org" ? `org:${row.role}` : `account:${row.target}:${row.role}`
                );
              return roles.length > 0 ? roles : undefined;
            },
            exists(source) {
              return source.role === "org:org_admin" || source.role.startsWith("account:");
            }
          },
          async reconcileUser(state) {
            const projected = projectionFromRoles(state.grants.map((grant) => grant.role));
            let current;
            try {
              current = await loadGrants(db(), state.userId);
            } catch {
              current = {
                orgRole: "none" as const,
                orgRoleSource: "none" as const,
                disabled: false,
                memberships: []
              };
            }
            const result = reconcileGrants({
              source: "scim",
              active: state.active,
              currentOrgRole: current.orgRole,
              currentOrgRoleSource: current.orgRoleSource,
              memberships: current.memberships,
              projected
            });
            await applyReconcile(db(), state.userId, result);
          }
        }
      })
    ]
  });
}

export async function countUsers(database: Database): Promise<number> {
  const rows = await database.select({ id: userTable.id }).from(userTable);
  return rows.length;
}
