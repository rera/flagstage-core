"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { can } from "@flagstage/core";
import { leadForm, site } from "@flagstage/db";

import { database, requirePrincipal } from "./guard";

function emailList(value: string): string[] | null {
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const ok = parts.every((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
  return ok ? parts : null;
}

export async function updateFormSettingsAction(formData: FormData) {
  const principal = await requirePrincipal();
  const siteId = String(formData.get("siteId") ?? "");
  const formId = String(formData.get("formId") ?? "");
  const accountSlug = String(formData.get("accountSlug") ?? "");
  const back = `/a/${accountSlug}/sites/${siteId}/plugins/forms/settings`;
  const rows = await database().select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  if (!found || !can(principal, "form.manage", { accountId: found.accountId, siteId: found.id })) {
    redirect(`${back}?error=save`);
  }
  const emails = emailList(String(formData.get("notifyEmail") ?? ""));
  const webhook = String(formData.get("webhookUrl") ?? "").trim();
  if (!emails) redirect(`${back}?error=email`);
  if (webhook && !/^https:\/\/\S+$/.test(webhook)) redirect(`${back}?error=webhook`);
  await database()
    .update(leadForm)
    .set({ notifyEmails: emails, webhookUrl: webhook || null })
    .where(and(eq(leadForm.id, formId), eq(leadForm.siteId, found.id)));
  redirect(back);
}
