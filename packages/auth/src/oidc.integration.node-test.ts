import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { account, idpGroupMapping, membership, ssoProvider, type Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";

import { createAuth } from "./create-auth";

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

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

describe("OIDC sign-in", () => {
  it("signs in against a local identity provider and maps the groups claim", async () => {
    const issuer = await new Promise<{ origin: string; close: () => Promise<void> }>((resolve) => {
      const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/.well-known/openid-configuration") {
          const origin = `http://127.0.0.1:${(request.socket.localPort ?? 0).toString()}`;
          response.setHeader("content-type", "application/json");
          response.end(
            JSON.stringify({
              issuer: origin,
              authorization_endpoint: `${origin}/authorize`,
              token_endpoint: `${origin}/token`,
              userinfo_endpoint: `${origin}/userinfo`,
              jwks_uri: `${origin}/jwks`,
              response_types_supported: ["code"],
              subject_types_supported: ["public"],
              id_token_signing_alg_values_supported: ["RS256"]
            })
          );
          return;
        }
        if (url.pathname === "/authorize") {
          const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
          redirect.searchParams.set("code", "local-code");
          redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
          response.writeHead(302, { location: redirect.toString() });
          response.end();
          return;
        }
        if (url.pathname === "/token") {
          await readBody(request);
          response.setHeader("content-type", "application/json");
          response.end(
            JSON.stringify({ access_token: "local-access", token_type: "Bearer", expires_in: 3600 })
          );
          return;
        }
        if (url.pathname === "/userinfo") {
          response.setHeader("content-type", "application/json");
          response.end(
            JSON.stringify({
              sub: "ada",
              email: "ada@example.com",
              name: "Ada Lovelace",
              email_verified: true,
              groups: ["grp-editors"]
            })
          );
          return;
        }
        response.writeHead(404);
        response.end();
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        resolve({
          origin: `http://127.0.0.1:${port}`,
          close: () => new Promise((done) => server.close(() => done()))
        });
      });
    });

    const client = new PGlite();
    try {
      await applyMigrations(client);
      const database = drizzle(client, { schema: fullSchema }) as unknown as Database;
      await database.insert(account).values({ id: "acct-1", name: "Digital", slug: "digital" });
      await database.insert(ssoProvider).values({
        id: "sso-1",
        issuer: issuer.origin,
        providerId: "directory",
        domain: "example.com",
        oidcConfig: JSON.stringify({
          clientId: "flagstage-core",
          clientSecret: "secret",
          discoveryEndpoint: `${issuer.origin}/.well-known/openid-configuration`,
          authorizationEndpoint: `${issuer.origin}/authorize`,
          tokenEndpoint: `${issuer.origin}/token`,
          userInfoEndpoint: `${issuer.origin}/userinfo`,
          pkce: true,
          mapping: { extraFields: { groups: "groups" } }
        })
      });
      await database.insert(idpGroupMapping).values({
        id: "map-1",
        providerId: "directory",
        groupExternalId: "grp-editors",
        groupDisplay: "Editors",
        target: "acct-1",
        role: "editor"
      });
      const auth = createAuth({
        database,
        secret: "test-secret-that-is-at-least-32-chars",
        baseURL: "http://localhost:3000",
        emailAndPassword: true,
        trustedOrigins: [issuer.origin]
      });

      const started = await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/sso", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            providerId: "directory",
            callbackURL: "http://localhost:3000/accounts"
          })
        })
      );
      const startedBody = (await started.json()) as { url?: string };
      assert.equal(started.status, 200, JSON.stringify(startedBody));
      if (!startedBody.url?.startsWith(issuer.origin)) {
        throw new Error(`unexpected authorization url ${startedBody.url ?? ""}`);
      }
      const authorizationUrl = startedBody.url;
      const cookie =
        started.headers.getSetCookie?.().join("; ") ?? started.headers.get("set-cookie") ?? "";

      const authorized = await fetch(authorizationUrl, { redirect: "manual" });
      const callback = authorized.headers.get("location");
      assert.ok(callback, "the identity provider redirects back with a code");
      const finished = await auth.handler(
        new Request(callback, { headers: cookie ? { cookie } : {} })
      );
      const location = finished.headers.get("location") ?? "";
      assert.ok(finished.status === 302 || finished.status === 200, await finished.text());
      assert.ok(!location.includes("error="), location);
      const grants = await database.select().from(membership);
      assert.equal(grants.length, 1);
      assert.equal(grants[0]?.role, "editor");
      assert.equal(grants[0]?.source, "sso_claim");
    } finally {
      await client.close();
      await issuer.close();
    }
  });
});
