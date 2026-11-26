import { loadConfig } from "@flagstage/config";
import { account } from "@flagstage/db";
import { eq } from "drizzle-orm";

import { database, requirePrincipal } from "../../../../../../src/guard";
import { saveAccountSkill } from "../../../../../../src/skill-save";

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string; slug: string }> }
) {
  const { accountId, slug } = await context.params;
  const principal = await requirePrincipal();
  const form = await request.formData();
  const result = await saveAccountSkill({
    principal,
    accountId,
    slug,
    body: String(form.get("body") ?? "")
  });
  if (result === "denied") return new Response("Forbidden", { status: 403 });
  if (result === "missing") return new Response("Not found", { status: 404 });
  const rows = await database().select().from(account).where(eq(account.id, accountId)).limit(1);
  const next = rows[0] ? `/a/${rows[0].slug}/skills/${slug}` : "/";
  return Response.redirect(new URL(next, loadConfig().APP_URL), 303);
}
