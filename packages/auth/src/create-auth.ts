import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";

import { user as userTable, type Database } from "@flagstage/db";

import * as schema from "@flagstage/db";

const authTables = {
  user: schema.user,
  session: schema.session,
  verification: schema.verification,
  auth_account: schema.authAccount
};

export type CreateAuthInput = {
  database: Database;
  secret: string;
  baseURL: string;
  emailAndPassword: boolean;
  trustedOrigins?: string[];
};

export function createAuth(input: CreateAuthInput) {
  return betterAuth({
    secret: input.secret,
    baseURL: input.baseURL,
    trustedOrigins: input.trustedOrigins,
    database: drizzleAdapter(input.database, {
      provider: "pg",
      camelCase: true,
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
    }
  });
}

export async function countUsers(database: Database): Promise<number> {
  const rows = await database.select({ id: userTable.id }).from(userTable);
  return rows.length;
}
