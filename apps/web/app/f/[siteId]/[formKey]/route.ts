import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { loadConfig } from "@flagstage/config";
import { leadForm, orgSettings, site, siteDomain, formSubmission } from "@flagstage/db";
import { corsHeaders, isHoneypot, signBody, takeToken } from "@flagstage/forms";

import { database } from "../../../../src/guard";

async function fieldsFrom(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(body).map(([key, value]) => [key, String(value ?? "")])
    );
  }
  const form = await request.formData();
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

export async function OPTIONS(
  request: Request,
  context: { params: Promise<{ siteId: string; formKey: string }> }
) {
  const { siteId } = await context.params;
  const headers = corsHeaders(request.headers.get("origin"), await hostsFor(siteId));
  return new Response(null, { status: 204, headers });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string; formKey: string }> }
) {
  const { siteId, formKey } = await context.params;
  const hosts = await hostsFor(siteId);
  const headers = corsHeaders(request.headers.get("origin"), hosts);
  const forms = await database().select().from(leadForm).where(eq(leadForm.siteId, siteId));
  const form = forms.find((item) => item.formKey === formKey);
  if (!form) return new Response("Not found", { status: 404, headers });
  const fields = await fieldsFrom(request);
  if (isHoneypot(fields)) return new Response(null, { status: 204, headers });
  const ip =
    (request.headers.get("x-forwarded-for") ?? "0.0.0.0").split(",")[0]?.trim() ?? "0.0.0.0";
  const allowed = await takeToken(database(), `form:${siteId}:${ip}`, 10, new Date());
  if (!allowed) return new Response("Slow down", { status: 429, headers });
  const stored = { ...fields };
  delete stored.website;
  await database()
    .insert(formSubmission)
    .values({
      id: crypto.randomUUID(),
      leadFormId: form.id,
      siteId,
      fields: stored,
      ipHash: createHash("sha256").update(ip).digest("hex"),
      userAgent: request.headers.get("user-agent")
    });
  if (form.webhookUrl && form.webhookSecret) {
    const body = JSON.stringify({ siteId, formKey, fields: stored });
    await fetch(form.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flagstage-signature": signBody(form.webhookSecret, body)
      },
      body
    }).catch(() => undefined);
  }
  return new Response(null, { status: 204, headers });
}

async function hostsFor(siteId: string): Promise<string[]> {
  const db = database();
  const sites = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = sites[0];
  if (!found) return [];
  const domains = await db.select().from(siteDomain).where(eq(siteDomain.siteId, siteId));
  const settings = await db.select().from(orgSettings).limit(1);
  const base = settings[0]?.baseDomain || new URL(loadConfig().APP_URL).hostname;
  return [...domains.map((domain) => domain.hostname), `${found.slug}.${base}`];
}
