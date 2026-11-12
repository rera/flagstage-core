import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { account, idpGroupMapping, membership, user, type Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";

import { createAuth } from "./create-auth";

const secret = "test-secret-that-is-at-least-32-chars";

async function applyMigrations(client: PGlite) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle");
  for (const file of ["0000_init.sql", "0001_auth_plugins.sql"]) {
    const sqlText = readFileSync(join(root, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await client.exec(query);
    }
  }
}

describe("SCIM provisioning", () => {
  it("grants a role from a group id and clears it when the group or the user is removed", async () => {
    const client = new PGlite();
    await applyMigrations(client);
    const database = drizzle(client, { schema: fullSchema }) as unknown as Database;
    await database.insert(account).values({ id: "acct-1", name: "Digital", slug: "digital" });
    const auth = createAuth({
      database,
      secret,
      baseURL: "http://localhost:3000",
      emailAndPassword: true
    });
    const created = await auth.api.createSCIMManagedConnection({
      body: {
        creationRequestId: "req-scim-connection-1",
        provisioningDomainId: "org",
        actorId: "bootstrap",
        scopes: ["scim.users.read", "scim.users.write", "scim.groups.read", "scim.groups.write"],
        expiresAt: new Date(Date.now() + 86_400_000)
      }
    });
    await database.insert(idpGroupMapping).values({
      id: "map-1",
      providerId: created.connection.connectionId,
      groupExternalId: "grp-editors",
      groupDisplay: "Editors",
      target: "acct-1",
      role: "editor"
    });

    async function call(path: string, method: string, body?: unknown) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method,
          headers: {
            authorization: `Bearer ${created.token}`,
            "content-type": "application/scim+json"
          },
          body: body ? JSON.stringify(body) : undefined
        })
      );
      const text = await response.text();
      return {
        status: response.status,
        json: text ? (JSON.parse(text) as Record<string, unknown>) : {}
      };
    }

    const provisioned = await call("/scim/v2/Users", "POST", {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName: "ada@example.com",
      externalId: "ada",
      name: { givenName: "Ada", familyName: "Lovelace" },
      emails: [{ value: "ada@example.com", primary: true }],
      active: true
    });
    assert.equal(provisioned.status, 201, JSON.stringify(provisioned.json));
    const userId = String(provisioned.json.id);

    const group = await call("/scim/v2/Groups", "POST", {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
      displayName: "Editors",
      externalId: "grp-editors",
      members: [{ value: userId }]
    });
    assert.equal(group.status, 201, JSON.stringify(group.json));
    const grants = await database.select().from(membership);
    assert.equal(grants.length, 1);
    assert.equal(grants[0]?.accountId, "acct-1");
    assert.equal(grants[0]?.role, "editor");
    assert.equal(grants[0]?.source, "scim");

    const patched = await call(`/scim/v2/Groups/${String(group.json.id)}`, "PATCH", {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [{ op: "replace", path: "members", value: [] }]
    });
    assert.ok(patched.status < 300, JSON.stringify(patched.json));
    assert.deepEqual(await database.select().from(membership), []);

    const deactivated = await call(`/scim/v2/Users/${userId}`, "PATCH", {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [{ op: "replace", path: "active", value: false }]
    });
    assert.ok(deactivated.status < 300, JSON.stringify(deactivated.json));
    const people = await database.select().from(user);
    assert.equal(people.length, 1);
    assert.ok(people[0]?.disabledAt);
    assert.equal(people[0]?.org_role, "none");
    await client.close();
  });
});
