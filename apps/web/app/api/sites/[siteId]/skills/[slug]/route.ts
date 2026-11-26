import { loadConfig } from "@flagstage/config";
import { account, site } from "@flagstage/db";
import { eq } from "drizzle-orm";

import { database, requirePrincipal } from "../../../../../../src/guard";
import { saveSiteSkill } from "../../../../../../src/skill-save";

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string; slug: string }> }
) {
  const { siteId, slug } = await context.params;
  const principal = await requirePrincipal();
  const form = await request.formData();
  const result = await saveSiteSkill({
    principal,
    siteId,
    slug,
    body: String(form.get("body") ?? "")
  });
  if (result === "denied") return new Response("Forbidden", { status: 403 });
  if (result === "missing") return new Response("Not found", { status: 404 });
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  const accounts = found
    ? await database().select().from(account).where(eq(account.id, found.accountId)).limit(1)
    : [];
  const slugName = accounts[0]?.slug;
  const next = slugName ? `/a/${slugName}/sites/${siteId}/skills/${slug}` : "/";
  return Response.redirect(new URL(next, loadConfig().APP_URL), 303);
}
