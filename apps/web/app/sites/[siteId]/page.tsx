import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Alert, Button, EmptyState, PageHeader, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { changeRequest, importRun, message, site, snapshot, thread } from "@flagstage/db";

import {
  approveChangeAction,
  approveSiteAction,
  rollbackAction,
  sendMessageAction,
  undoEditAction
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
  searchParams: Promise<{ error?: string }>;
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
  const threads = await db.select().from(thread).where(eq(thread.siteId, siteId)).limit(1);
  const threadId = threads[0]?.id;
  const messages = threadId
    ? await db.select().from(message).where(eq(message.threadId, threadId))
    : [];
  const requests = await db.select().from(changeRequest).where(eq(changeRequest.siteId, siteId));
  const ready = requests.filter((item) => item.status === "preview_ready");
  const progress = (latest?.stats ?? {}) as {
    pagesFound?: number;
    pagesDone?: number;
    skipped?: Array<{ path: string; reason: string }>;
  };
  const draftId = found.draftSnapshotId ?? found.currentSnapshotId;
  const snaps = await db.select().from(snapshot).where(eq(snapshot.siteId, siteId));
  const pendingSnapshot = snaps
    .filter((item) => item.kind === "import")
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .at(-1);
  const canPublish = can(principal, "site.publish", { accountId: found.accountId });
  const canEdit = can(principal, "site.edit", { accountId: found.accountId });
  return (
    <>
      <PageHeader
        title={found.name}
        description={`${found.slug}.localhost`}
        actions={
          <>
            <a href={`/sites/${found.id}/domain`}>{t("domains.title")}</a>
            <a href={`/sites/${found.id}/forms`}>{t("forms.title")}</a>
            <a href={`/sites/${found.id}/analytics`}>{t("analytics.title")}</a>
          </>
        }
      />
      <ChatStream siteId={found.id} />
      {query.error ? <Alert tone="bad">{t("sites.failed")}</Alert> : null}
      {found.status === "importing" ? (
        <Alert>
          <p>{t("sites.importing")}</p>
          <p>
            {t("sites.pagesFound")} {progress.pagesFound ?? 0}. {t("sites.pagesDone")}{" "}
            {progress.pagesDone ?? 0}.
          </p>
          {(progress.skipped ?? []).length > 0 ? (
            <ul>
              {(progress.skipped ?? []).map((item) => (
                <li key={item.path}>
                  {t("sites.skipped")} {item.path}: {item.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      {found.status === "failed" ? (
        <Alert tone="bad">{latest?.error ?? t("sites.failed")}</Alert>
      ) : null}
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
      {pendingSnapshot && canPublish && !found.currentSnapshotId && found.status === "preview" ? (
        <form action={approveSiteAction}>
          <input type="hidden" name="siteId" value={found.id} />
          <input type="hidden" name="accountId" value={found.accountId} />
          <input type="hidden" name="snapshotId" value={pendingSnapshot.id} />
          <Button type="submit">{t("sites.goLive")}</Button>
        </form>
      ) : null}
      <div className="builder">
        <section className="builder-chat">
          <h2>{t("chat.title")}</h2>
          {threads[0]?.status === "queued" ? <p>{t("chat.working")}</p> : null}
          {messages.some((item) => item.body === "Someone else is editing this site.") ? (
            <Alert>{t("chat.locked")}</Alert>
          ) : null}
          <ul>
            {messages.map((item) => (
              <li key={item.id}>
                <strong>{item.author}</strong> {item.body}
              </li>
            ))}
          </ul>
          {draftId ? (
            <a className="preview-link" href={`/sites/${found.id}/live`}>
              {t("chat.preview")}
            </a>
          ) : null}
          {can(principal, "site.comment", { accountId: found.accountId }) ? (
            <form id="composer" action={sendMessageAction}>
              <input type="hidden" name="siteId" value={found.id} />
              <input type="hidden" name="accountId" value={found.accountId} />
              <label className="field" htmlFor="body">
                <span>{t("chat.placeholder")}</span>
                <textarea id="body" name="body" rows={4} required />
              </label>
              <Button type="submit">{t("chat.send")}</Button>
            </form>
          ) : null}
          {canEdit && found.draftSnapshotId ? (
            <form action={undoEditAction}>
              <input type="hidden" name="siteId" value={found.id} />
              <input type="hidden" name="accountId" value={found.accountId} />
              <Button type="submit" variant="quiet">
                {t("chat.undo")}
              </Button>
            </form>
          ) : null}
          {canPublish
            ? ready.slice(-1).map((item) => (
                <form key={item.id} action={approveChangeAction}>
                  <input type="hidden" name="siteId" value={found.id} />
                  <input type="hidden" name="accountId" value={found.accountId} />
                  <input type="hidden" name="changeRequestId" value={item.id} />
                  <Button type="submit">{t("chat.approve")}</Button>
                </form>
              ))
            : null}
        </section>
        <aside className="builder-preview">
          {draftId ? (
            <iframe title={t("chat.preview")} src={`/sites/${found.id}/live?v=${draftId}`} />
          ) : (
            <p>{t("sites.importing")}</p>
          )}
        </aside>
      </div>
      <h2>{t("versions.title")}</h2>
      {snaps.length === 0 ? (
        <EmptyState
          title={t("versions.emptyTitle")}
          description={t("versions.emptyBody")}
          action={<a href="#composer">{t("versions.emptyAction")}</a>}
        />
      ) : (
        <table className="data">
          <tbody>
            {snaps.map((item) => (
              <tr key={item.id}>
                <td>{item.kind}</td>
                <td className="mono">{item.createdAt.toISOString()}</td>
                <td>{item.id === found.currentSnapshotId ? t("versions.current") : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
