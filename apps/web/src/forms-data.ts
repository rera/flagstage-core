import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { can } from "@flagstage/core";
import { formSubmission, leadForm } from "@flagstage/db";

import { database, requireSite } from "./guard";

export async function loadFormsPlugin(accountSlug: string, siteId: string) {
  const { principal, site: found } = await requireSite(accountSlug, siteId);
  if (!can(principal, "form.read", { accountId: found.accountId, siteId: found.id })) notFound();
  const db = database();
  const forms = await db.select().from(leadForm).where(eq(leadForm.siteId, found.id));
  const submissions =
    forms.length === 0
      ? []
      : await db
          .select()
          .from(formSubmission)
          .where(
            inArray(
              formSubmission.leadFormId,
              forms.map((form) => form.id)
            )
          );
  const newest = [...submissions].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
  );
  const ordered = [...forms].sort((left, right) => {
    const leftAt = newest.find((row) => row.leadFormId === left.id)?.createdAt.getTime() ?? 0;
    const rightAt = newest.find((row) => row.leadFormId === right.id)?.createdAt.getTime() ?? 0;
    if (leftAt !== rightAt) return rightAt - leftAt;
    return left.name.localeCompare(right.name);
  });
  return {
    found,
    forms: ordered,
    submissions: newest,
    canManage: can(principal, "form.manage", { accountId: found.accountId, siteId: found.id }),
    base: `/a/${accountSlug}/sites/${found.id}`
  };
}
