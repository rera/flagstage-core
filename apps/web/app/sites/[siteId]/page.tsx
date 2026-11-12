import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Alert, Button, PageHeader, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { importRun, site } from "@flagstage/db";

import { approveSiteAction } from "../../../src/actions";
import { database, requirePrincipal } from "../../../src/guard";

type Report = {
  forms?: Array<{ page: string; kind: string; detail: string }>;
  plugins?: Array<{ page: string; kind: string; detail: string }>;
  missingAssets?: string[];
  cssBackgrounds?: string[];
};

export default async function SitePage({
  params,
  searchParams
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ snapshot?: string }>;
}) {
  const { siteId } = await params;
  const query = await searchParams;
  const principal = await requirePrincipal();
  const db = database();
  const rows = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = rows[0];
  if (!found || !can(principal, "site.read", { accountId: found.accountId })) notFound();
  const runs = await db.select().from(importRun).where(eq(importRun.siteId, siteId));
  const latest = runs[runs.length - 1];
  const report = (latest?.fidelityReport ?? null) as Report | null;
  const snapshotId = query.snapshot;
  return (
    <>
      <PageHeader title={found.name} description={`${found.slug}.localhost`} />
      {found.status === "live" ? <Alert tone="ok">{t("sites.live")}</Alert> : null}
      {report ? (
        <>
          <h2>{t("sites.fidelity")}</h2>
          <ul>
            {(report.forms ?? []).map((item) => (
              <li key={`${item.kind}${item.page}`}>
                {item.page}: {item.detail}
              </li>
            ))}
            {(report.plugins ?? []).map((item) => (
              <li key={`${item.kind}${item.page}`}>
                {item.page}: {item.detail}
              </li>
            ))}
            {(report.missingAssets ?? []).map((asset) => (
              <li key={asset}>
                {t("sites.missing")} {asset}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {snapshotId &&
      can(principal, "site.publish", { accountId: found.accountId }) &&
      !found.currentSnapshotId ? (
        <form action={approveSiteAction}>
          <input type="hidden" name="siteId" value={found.id} />
          <input type="hidden" name="accountId" value={found.accountId} />
          <input type="hidden" name="snapshotId" value={snapshotId} />
          <Button type="submit">{t("sites.goLive")}</Button>
        </form>
      ) : null}
    </>
  );
}
