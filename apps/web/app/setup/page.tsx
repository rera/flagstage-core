import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { can } from "@flagstage/core";
import { account, orgSettings } from "@flagstage/db";
import { Alert, Button, PageHeader, TextField, t, type MessageKey } from "@flagstage/ui";

import {
  createAccountAction,
  saveGroupMapping,
  saveOidcProvider,
  saveOrganization,
  saveSamlProvider,
  testModelKeyAction
} from "../../src/actions";
import { database, requirePrincipal } from "../../src/guard";
import { ModelKeyForm } from "../model-key-form";

const STEPS = ["org", "idp", "account", "groups"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABEL: Record<Step, MessageKey> = {
  org: "setup.step.org",
  idp: "setup.step.idp",
  account: "setup.step.account",
  groups: "setup.step.groups"
};

function stepOf(value: string | undefined): Step {
  return STEPS.find((step) => step === value) ?? "org";
}

export default async function SetupPage({
  searchParams
}: {
  searchParams: Promise<{ step?: string; error?: string }>;
}) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/accounts");
  const params = await searchParams;
  const step = stepOf(params.step);
  const db = database();
  const rows = await db.select().from(orgSettings).where(eq(orgSettings.id, "org")).limit(1);
  const org = rows[0];
  const accounts = await db.select().from(account);
  return (
    <>
      <PageHeader title={t("setup.title")} description={t("setup.description")} />
      <ol className="steps">
        {STEPS.map((item) => (
          <li key={item}>
            <a href={`/setup?step=${item}`} aria-current={item === step ? "step" : undefined}>
              {t(STEP_LABEL[item])}
            </a>
          </li>
        ))}
      </ol>
      {params.error === "provider" ? (
        <Alert tone="bad">{t("settings.providerFailed")}</Alert>
      ) : null}
      {params.error && params.error !== "provider" ? (
        <Alert tone="bad">{t("settings.invalid")}</Alert>
      ) : null}
      {step === "org" ? (
        <>
          <form action={saveOrganization} className="narrow">
            <input type="hidden" name="next" value="/setup?step=idp" />
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
      ) : null}
      {step === "idp" ? (
        <>
          <p>{t("setup.idpLead")}</p>
          <form action={saveOidcProvider} className="narrow">
            <input type="hidden" name="next" value="/setup?step=account" />
            <h2>{t("settings.oidc")}</h2>
            <TextField label={t("settings.providerId")} name="providerId" required />
            <TextField label={t("settings.domain")} name="domain" required />
            <TextField label={t("settings.issuer")} name="issuer" required />
            <TextField label={t("settings.clientId")} name="clientId" required />
            <TextField
              label={t("settings.clientSecret")}
              name="clientSecret"
              type="password"
              required
            />
            <Button type="submit">{t("settings.saveProvider")}</Button>
          </form>
          <form action={saveSamlProvider} className="narrow">
            <input type="hidden" name="next" value="/setup?step=account" />
            <h2>{t("settings.saml")}</h2>
            <TextField label={t("settings.providerId")} name="providerId" required />
            <TextField label={t("settings.domain")} name="domain" required />
            <TextField label={t("settings.issuer")} name="issuer" required />
            <TextField label={t("settings.entryPoint")} name="entryPoint" required />
            <label className="field">
              <span>{t("settings.certificate")}</span>
              <textarea name="certificate" rows={6} required />
            </label>
            <Button type="submit">{t("settings.saveProvider")}</Button>
          </form>
          <p>
            <a href="/setup?step=account">{t("setup.skip")}</a>
          </p>
        </>
      ) : null}
      {step === "account" ? (
        <form action={createAccountAction} className="narrow">
          <input type="hidden" name="next" value="/setup?step=groups" />
          <p>{t("setup.accountLead")}</p>
          <TextField label={t("accounts.name")} name="name" required />
          <Button type="submit">{t("accounts.create")}</Button>
        </form>
      ) : null}
      {step === "groups" ? (
        <>
          <p>{t("setup.groupsLead")}</p>
          <form action={saveGroupMapping} className="narrow">
            <input type="hidden" name="next" value="/accounts" />
            <TextField label={t("settings.providerId")} name="providerId" required />
            <TextField
              label={t("settings.groupId")}
              name="groupExternalId"
              hint={t("settings.groupIdHint")}
              required
            />
            <TextField label={t("settings.groupName")} name="groupDisplay" />
            <label className="field">
              <span>{t("settings.target")}</span>
              <select name="target" required>
                <option value="org">{t("settings.orgTarget")}</option>
                {accounts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("members.role")}</span>
              <select name="role" defaultValue="account_admin">
                <option value="org_admin">{t("roles.orgAdmin")}</option>
                <option value="account_admin">{t("roles.accountAdmin")}</option>
                <option value="editor">{t("roles.editor")}</option>
                <option value="reviewer">{t("roles.reviewer")}</option>
              </select>
            </label>
            <Button type="submit">{t("settings.saveMapping")}</Button>
          </form>
          <p>
            <a href="/accounts">{t("setup.skip")}</a>
          </p>
        </>
      ) : null}
    </>
  );
}
