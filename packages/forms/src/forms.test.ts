import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import type { Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";

import { allowedOrigin, isHoneypot, signBody, takeToken, toCsv } from "./forms";

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

describe("lead forms", () => {
  it("allows only the site hosts", () => {
    const hosts = ["www.example.com", "demo.localhost:3000"];
    expect(allowedOrigin("https://www.example.com", hosts)).toBe("https://www.example.com");
    expect(allowedOrigin("https://evil.example", hosts)).toBeNull();
    expect(allowedOrigin("http://demo.localhost:3000", hosts)).toBe("http://demo.localhost:3000");
  });

  it("drops a filled honeypot", () => {
    expect(isHoneypot({ website: "spam", email: "a@b.c" })).toBe(true);
    expect(isHoneypot({ website: "", email: "a@b.c" })).toBe(false);
  });

  it("signs a webhook body", () => {
    const body = JSON.stringify({ email: "a@b.c" });
    const signature = signBody("secret", body);
    expect(signature).toBe(signBody("secret", body));
    expect(signature.startsWith("sha256=")).toBe(true);
    expect(signature).not.toBe(signBody("other", body));
  });

  it("escapes commas, quotes, and newlines in CSV", () => {
    const csv = toCsv([
      { name: 'Ada "A"', note: "hello, world" },
      { name: "Bea", note: "line\n2" }
    ]);
    expect(csv).toContain('"Ada ""A"""');
    expect(csv).toContain('"hello, world"');
    expect(csv).toContain('"line\n2"');
  });

  it("refills a postgres token bucket", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client);
      const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
      const start = new Date("2026-01-01T00:00:00Z");
      expect(await takeToken(db, "ip", 2, start)).toBe(true);
      expect(await takeToken(db, "ip", 2, new Date(start.getTime() + 1000))).toBe(true);
      expect(await takeToken(db, "ip", 2, new Date(start.getTime() + 2000))).toBe(false);
      expect(await takeToken(db, "ip", 2, new Date(start.getTime() + 60_000))).toBe(true);
    } finally {
      await client.close();
    }
  });
});
