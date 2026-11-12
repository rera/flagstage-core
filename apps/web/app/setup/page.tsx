import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { can } from "@flagstage/core";
import { orgSettings } from "@flagstage/db";
import { Alert, Button, PageHeader, TextField, t } from "@flagstage/ui";

import { createAccountAction, saveOrganization, testModelKeyAction } from "../../src/actions";
import { database, requirePrincipal } from "../../src/guard";
import { ModelKeyForm } from "../model-key-form";

export default async function SetupPage({
  searchParams
}: {
  searchParams: Promise<{ step?: string; error?: string }>;
}) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/accounts");
  const params = await searchParams;
  const step = params.step === "account" ? "account" : "org";
  const rows = await database()
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.id, "org"))
    .limit(1);
  const org = rows[0];
  return (
    <>
      <PageHeader title={t("setup.title")} description={t("setup.description")} />
      <ol className="steps">
        <li>
          <a href="/setup?step=org" aria-current={step === "org" ? "step" : undefined}>
            {t("setup.step.org")}
          </a>
        </li>
        <li>
          <a href="/setup?step=account" aria-current={step === "account" ? "step" : undefined}>
            {t("setup.step.account")}
          </a>
        </li>
      </ol>
      {params.error ? <Alert tone="bad">{t("settings.invalid")}</Alert> : null}
      {step === "org" ? (
        <>
          <form action={saveOrganization} className="narrow">
            <input type="hidden" name="next" value="/setup?step=account" />
            <TextField
              label={t("setup.name")}
              name="name"
              defaultValue={org?.name ?? ""}
              required
            />
            <TextField
              label={t("setup.domain")}
              name="baseDomain"
              defaultValue={org?.baseDomain ?? ""}
              hint={t("setup.domainHint")}
              required
            />
            <label className="field">
              <span>{t("setup.logo")}</span>
              <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
              <small>{t("setup.logoHint")}</small>
            </label>
            {org?.logoUrl ? <img src={org.logoUrl} alt="" width={48} height={48} /> : null}
            <Button type="submit">{t("setup.save")}</Button>
          </form>
          <ModelKeyForm action={testModelKeyAction} label={t("model.test")} />
        </>
      ) : (
        <form action={createAccountAction} className="narrow">
          <p>{t("setup.accountLead")}</p>
          <input type="hidden" name="next" value="/accounts" />
          <TextField label={t("accounts.name")} name="name" required />
          <Button type="submit">{t("accounts.create")}</Button>
        </form>
      )}
    </>
  );
}
