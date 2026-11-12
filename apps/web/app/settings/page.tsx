import { redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import { Alert, Button, PageHeader, TextField, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { account, idpGroupMapping, ssoProvider } from "@flagstage/db";

import { SecretForm } from "../secret-form";
import {
  issueScimToken,
  saveGroupMapping,
  saveOidcProvider,
  saveSamlProvider,
  testModelKeyAction
} from "../../src/actions";
import { database, requirePrincipal } from "../../src/guard";
import { ModelKeyForm } from "../model-key-form";

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/accounts");
  const params = await searchParams;
  const db = database();
  const providers = await db.select().from(ssoProvider);
  const mappings = await db.select().from(idpGroupMapping);
  const accounts = await db.select().from(account);
  const appUrl = loadConfig().APP_URL;
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <ModelKeyForm action={testModelKeyAction} label={t("model.test")} />
      {params.saved ? <Alert tone="ok">{t("settings.saved")}</Alert> : null}
      {params.error === "provider" ? (
        <Alert tone="bad">{t("settings.providerFailed")}</Alert>
      ) : null}
      {params.error && params.error !== "provider" ? (
        <Alert tone="bad">{t("settings.invalid")}</Alert>
      ) : null}
      <h2>{t("settings.sso")}</h2>
      <p className="mono">
        {t("settings.redirect")} {appUrl}/api/auth/sso/callback/{"{providerId}"}
      </p>
      <table className="data">
        <tbody>
          {providers.map((provider) => (
            <tr key={provider.id}>
              <td>{provider.providerId}</td>
              <td>{provider.domain}</td>
              <td>{provider.oidcConfig ? "OIDC" : "SAML"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form action={saveOidcProvider} className="narrow">
        <h3>{t("settings.oidc")}</h3>
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
        <h3>{t("settings.saml")}</h3>
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
      <h2>{t("settings.groups")}</h2>
      <p>{t("settings.groupsHint")}</p>
      <table className="data">
        <tbody>
          {mappings.map((mapping) => (
            <tr key={mapping.id}>
              <td className="mono">{mapping.groupExternalId}</td>
              <td>{mapping.target}</td>
              <td>{mapping.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form action={saveGroupMapping} className="narrow">
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
          <select name="role" defaultValue="editor">
            <option value="org_admin">{t("roles.orgAdmin")}</option>
            <option value="account_admin">{t("roles.accountAdmin")}</option>
            <option value="editor">{t("roles.editor")}</option>
            <option value="reviewer">{t("roles.reviewer")}</option>
          </select>
        </label>
        <Button type="submit">{t("settings.saveMapping")}</Button>
      </form>
      <h2>{t("settings.scim")}</h2>
      <p className="mono">
        {t("settings.scimUrl")} {appUrl}/api/auth/scim/v2
      </p>
      <SecretForm
        action={issueScimToken}
        submit={t("settings.issueToken")}
        secretLabel={t("settings.tokenOnce")}
      />
    </>
  );
}
