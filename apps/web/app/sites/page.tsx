import Link from "next/link";

import { Alert, Button, PageHeader, TextField, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { account, site } from "@flagstage/db";
import { inArray } from "drizzle-orm";

import { importSiteAction } from "../../src/actions";
import { database, requirePrincipal } from "../../src/guard";

export default async function SitesPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const principal = await requirePrincipal();
  const params = await searchParams;
  const db = database();
  const accounts = can(principal, "org.manage")
    ? await db.select().from(account)
    : await db
        .select()
        .from(account)
        .where(
          inArray(
            account.id,
            principal.memberships.map((membership) => membership.accountId)
          )
        );
  const accountIds = accounts.map((row) => row.id);
  const sites =
    accountIds.length === 0
      ? []
      : await db.select().from(site).where(inArray(site.accountId, accountIds));
  const manageable = accounts.filter((row) => can(principal, "site.manage", { accountId: row.id }));
  return (
    <>
      <PageHeader title={t("sites.title")} description={t("sites.lead")} />
      {params.error ? <Alert tone="bad">{t("sites.failed")}</Alert> : null}
      <table className="data">
        <tbody>
          {sites.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/sites/${row.id}`}>{row.name}</Link>
              </td>
              <td>{row.status}</td>
              <td className="mono">{row.slug}.localhost</td>
            </tr>
          ))}
        </tbody>
      </table>
      {manageable.length > 0 ? (
        <form action={importSiteAction} className="narrow">
          <h2>{t("sites.import")}</h2>
          <TextField label={t("sites.name")} name="name" required />
          <TextField label={t("sites.url")} name="sourceUrl" type="url" required />
          <label className="field">
            <span>{t("sites.account")}</span>
            <select name="accountId" required>
              {manageable.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">{t("sites.import")}</Button>
        </form>
      ) : null}
    </>
  );
}
