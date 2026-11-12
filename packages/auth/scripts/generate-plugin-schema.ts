import { readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";

const require = createRequire(import.meta.url);
const adapterEntry = require.resolve("@better-auth/drizzle-adapter");
const dist = dirname(adapterEntry);
const file = readdirSync(dist).find((name) => name.startsWith("generate-drizzle-schema"));
if (!file) throw new Error("generate-drizzle-schema chunk not found");
const mod = await import(join(dist, file));
const generateDrizzleSchema = mod.generateDrizzleSchema as (input: {
  options: unknown;
  file: string;
  provider: "pg";
  camelCase: boolean;
}) => Promise<{ code: string }>;

const secret = "x".repeat(40);
const target = new URL("../../db/src/auth-plugin-tables.ts", import.meta.url);
const generated = await generateDrizzleSchema({
  provider: "pg",
  camelCase: true,
  file: target.pathname,
  options: {
    plugins: [
      sso(),
      scim({
        connections: [],
        managedConnections: { credentialHashSecret: secret },
        projection: {
          roles: { map: () => undefined, exists: () => true },
          reconcileUser: async () => {}
        }
      })
    ]
  }
});
const code = generated.code;
if (!code) throw new Error("generator returned no code");
writeFileSync(target, code);
console.log("wrote", target.pathname, code.length);
