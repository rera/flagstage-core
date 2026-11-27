"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { can } from "@flagstage/core";
import { account, leadForm, site } from "@flagstage/db";

import { notifyEmailList, notifyWebhook } from "./forms-submissions";
import { database, requirePrincipal } from "./guard";

export async function updateFormSettingsAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const formId = String(formData.get("formId") ?? "");
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  if (!found) redirect("/no-access");
  const accounts = await database()
    .select()
    .from(account)
    .where(eq(account.id, found.accountId))
    .limit(1);
  const slug = accounts[0]?.slug;
  if (!slug) redirect("/no-access");
  const back = `/a/${slug}/sites/${found.id}/plugins/forms/settings`;
  if (!can(principal, "form.manage", { accountId: found.accountId, siteId: found.id })) {
    redirect(`${back}?error=save`);
  }
  const emails = notifyEmailList(String(formData.get("notifyEmail") ?? ""));
  if (!emails) redirect(`${back}?error=email`);
  const webhook = notifyWebhook(String(formData.get("webhookUrl") ?? ""));
  if (webhook === null) redirect(`${back}?error=webhook`);
  await database()
    .update(leadForm)
    .set({ notifyEmails: emails, webhookUrl: webhook || null })
    .where(and(eq(leadForm.id, formId), eq(leadForm.siteId, found.id)));
  redirect(back);
}
