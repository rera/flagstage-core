import { eq } from "drizzle-orm";

import { Button, PageHeader, TextField, t } from "@flagstage/ui";
import { orgSettings } from "@flagstage/db";

import { saveOrganization } from "../../src/actions";
import { database, requirePrincipal } from "../../src/guard";
import { can } from "@flagstage/core";
import { redirect } from "next/navigation";

export default async function SetupPage() {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/accounts");
  const rows = await database()
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.id, "org"))
    .limit(1);
  const org = rows[0];
  return (
    <>
      <PageHeader title={t("setup.title")} description={t("setup.description")} />
      <form action={saveOrganization} className="narrow">
        <TextField label={t("setup.name")} name="name" defaultValue={org?.name ?? ""} required />
        <TextField
          label={t("setup.domain")}
          name="baseDomain"
          defaultValue={org?.baseDomain ?? ""}
          hint={t("setup.domainHint")}
          required
        />
        <Button type="submit">{t("setup.save")}</Button>
      </form>
    </>
  );
}
