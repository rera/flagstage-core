import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Database } from "@flagstage/db";
import { rateBucket } from "@flagstage/db";

export function allowedOrigin(origin: string | null, hosts: string[]): string | null {
  if (!origin) return null;
  let host = "";
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
  return hosts.map((item) => item.toLowerCase()).includes(host) ? origin : null;
}

export function corsHeaders(origin: string | null, hosts: string[]): Headers {
  const headers = new Headers();
  const allow = allowedOrigin(origin, hosts);
  if (allow) {
    headers.set("access-control-allow-origin", allow);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("vary", "Origin");
  }
  return headers;
}

export function isHoneypot(fields: Record<string, string>): boolean {
  return (fields.website ?? "").trim().length > 0;
}

export async function takeToken(
  db: Database,
  key: string,
  capacity: number,
  now: Date,
  windowMs = 60_000
): Promise<boolean> {
  const rows = await db.select().from(rateBucket).where(eq(rateBucket.key, key)).limit(1);
  const row = rows[0];
  if (!row) {
    await db.insert(rateBucket).values({ key, tokens: capacity - 1, updatedAt: now });
    return true;
  }
  const gained = Math.floor(((now.getTime() - row.updatedAt.getTime()) / windowMs) * capacity);
  const refilled = Math.min(capacity, row.tokens + gained);
  if (refilled < 1) return false;
  await db
    .update(rateBucket)
    .set({ tokens: refilled - 1, updatedAt: now })
    .where(eq(rateBucket.key, key));
  return true;
}

export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function toCsv(rows: Array<Record<string, string>>): string {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}
