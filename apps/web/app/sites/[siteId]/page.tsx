import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Alert, Button, PageHeader, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { changeRequest, importRun, message, site, snapshot, thread } from "@flagstage/db";

import {
  approveChangeAction,
  approveSiteAction,
  releaseHoldAction,
  rollbackAction,
  sendMessageAction
} from "../../../src/actions";
import { database, requirePrincipal } from "../../../src/guard";
import { ChatStream } from "./chat-stream";

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
  const threads = await db.select().from(thread).where(eq(thread.siteId, siteId)).limit(1);
  const threadId = threads[0]?.id;
  const messages = threadId
    ? await db.select().from(message).where(eq(message.threadId, threadId))
    : [];
  const requests = await db.select().from(changeRequest).where(eq(changeRequest.siteId, siteId));
  const ready = requests.filter((item) => item.status === "preview_ready");
  const held = requests.filter((item) => item.status === "needs_human");
  const snaps = await db.select().from(snapshot).where(eq(snapshot.siteId, siteId));
  const canPublish = can(principal, "site.publish", { accountId: found.accountId });
  const canRelease = can(principal, "member.manage", { accountId: found.accountId });
  return (
    <>
      <PageHeader
        title={found.name}
        description={`${found.slug}.localhost`}
        actions={<a href={`/sites/${found.id}/domain`}>{t("domains.title")}</a>}
      />
      <ChatStream siteId={found.id} />
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
      {snapshotId && canPublish && !found.currentSnapshotId ? (
        <form action={approveSiteAction}>
          <input type="hidden" name="siteId" value={found.id} />
          <input type="hidden" name="accountId" value={found.accountId} />
          <input type="hidden" name="snapshotId" value={snapshotId} />
          <Button type="submit">{t("sites.goLive")}</Button>
        </form>
      ) : null}
      <h2>{t("chat.title")}</h2>
      <ul>
        {messages.map((item) => (
          <li key={item.id}>
            <strong>{item.author}</strong> {item.body}
          </li>
        ))}
      </ul>
      {can(principal, "site.comment", { accountId: found.accountId }) ? (
        <form action={sendMessageAction}>
          <input type="hidden" name="siteId" value={found.id} />
          <input type="hidden" name="accountId" value={found.accountId} />
          <label className="field" htmlFor="body">
            <span>{t("chat.placeholder")}</span>
            <textarea id="body" name="body" rows={4} required />
          </label>
          <Button type="submit">{t("chat.send")}</Button>
        </form>
      ) : null}
      {canPublish
        ? ready.map((item) => {
            const link = messages.find((entry) => entry.body.includes("/preview/"))?.body ?? "";
            return (
              <form key={item.id} action={approveChangeAction}>
                <p>{link}</p>
                <input type="hidden" name="siteId" value={found.id} />
                <input type="hidden" name="accountId" value={found.accountId} />
                <input type="hidden" name="changeRequestId" value={item.id} />
                <Button type="submit">{t("chat.approve")}</Button>
              </form>
            );
          })
        : null}
      {canRelease
        ? held.map((item) => (
            <form key={item.id} action={releaseHoldAction}>
              <p>{t("chat.held")}</p>
              <input type="hidden" name="accountId" value={found.accountId} />
              <input type="hidden" name="changeRequestId" value={item.id} />
              <Button type="submit">{t("chat.approve")}</Button>
            </form>
          ))
        : null}
      {canPublish && snaps.length > 1 ? (
        <form action={rollbackAction}>
          <input type="hidden" name="siteId" value={found.id} />
          <input type="hidden" name="accountId" value={found.accountId} />
          <label className="field" htmlFor="snapshotId">
            <span>{t("chat.rollback")}</span>
            <select id="snapshotId" name="snapshotId">
              {snaps
                .filter((item) => item.id !== found.currentSnapshotId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.kind} {item.createdAt.toISOString()}
                  </option>
                ))}
            </select>
          </label>
          <Button type="submit" variant="quiet">
            {t("chat.rollback")}
          </Button>
        </form>
      ) : null}
    </>
  );
}
