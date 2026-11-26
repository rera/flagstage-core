import { loadConfig } from "@flagstage/config";
import { account, site } from "@flagstage/db";
import { eq } from "drizzle-orm";

import { database, requirePrincipal } from "../../../../../src/guard";
import { publishDraftFor } from "../../../../../src/publish-draft";

export async function POST(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params;
  const principal = await requirePrincipal();
  const form = await request.formData();
  const result = await publishDraftFor({
    principal,
    siteId,
    snapshotId: String(form.get("snapshotId") ?? "")
  });
  if (result === "denied") return new Response("Forbidden", { status: 403 });
  if (result === "failed") return new Response("Bad request", { status: 400 });
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  const accounts = found
    ? await database().select().from(account).where(eq(account.id, found.accountId)).limit(1)
    : [];
  const next = accounts[0] ? `/a/${accounts[0].slug}/sites/${siteId}` : "/";
  return Response.redirect(new URL(next, loadConfig().APP_URL), 303);
}
