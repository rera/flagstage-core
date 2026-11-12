import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import {
  Alert,
  Button,
  EmptyState,
  FlagstageMark,
  Label,
  Textarea,
  fieldClass,
  t
} from "@flagstage/ui";
import { can } from "@flagstage/core";
import { changeRequest, importRun, message, site, snapshot, thread } from "@flagstage/db";

import {
  approveChangeAction,
  approveSiteAction,
  rollbackAction,
  sendMessageAction,
  undoEditAction
} from "../../../../src/actions";
import { BrowserFrame } from "../../../../src/browser-frame";
import { database, requirePrincipal } from "../../../../src/guard";
import { chatBody, friendlyWhen, versionLabel } from "../../../../src/time";
import { ChatStream } from "./chat-stream";

type Report = {
  forms?: Array<{ page: string; kind: string; detail: string }>;
  plugins?: Array<{ page: string; kind: string; detail: string }>;
  missingAssets?: string[];
  cssBackgrounds?: string[];
};

function Thinking({ label }: { label: string }) {
  return (
    <div className="mb-4 flex gap-3">
      <span className="grid size-[30px] shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[#14161a]">
        <FlagstageMark className="size-7" />
      </span>
      <p className="thinking-label pt-1 text-[14.5px] font-medium">{label}</p>
    </div>
  );
}

function Steps({
  items
}: {
  items: Array<{ id: string; label: string; state: "done" | "active" | "wait" }>;
}) {
  if (items.length === 0) return null;
  return (
    <ol className="mb-5 overflow-hidden rounded-2xl border border-border bg-card">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 text-[13.5px] last:border-b-0"
        >
          <span
            className={
              item.state === "done"
                ? "size-2 rounded-full bg-[var(--done)]"
                : item.state === "active"
                  ? "size-2 animate-spin rounded-full border-2 border-[var(--prog)] border-t-transparent"
                  : "size-2 rounded-full bg-border"
            }
            aria-hidden
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ol>
  );
}

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
  const host = `${found.slug}.localhost`;
  const siblings = await db.select().from(site).where(eq(site.accountId, found.accountId));
  const working = threads[0]?.status === "queued";
  const importing = found.status === "importing";
  return (
    <div className="flex h-[calc(100dvh-60px)] min-h-0 flex-col">
      <ChatStream siteId={found.id} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{found.name}</h1>
          <details className="relative">
            <summary className="cursor-pointer list-none font-mono text-xs text-muted-foreground marker:content-none">
              {host}
            </summary>
            <div className="absolute z-overlay mt-1 min-w-52 rounded-xl border border-border bg-popover p-1 shadow-sm">
              {siblings.map((item) => (
                <a
                  key={item.id}
                  href={`/sites/${item.id}`}
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--wash)]"
                >
                  {item.name}
                  <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                    {item.slug}.localhost
                  </span>
                </a>
              ))}
            </div>
          </details>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/sites/${found.id}/domain`} className="text-sm font-medium text-primary">
            {t("domains.title")}
          </a>
          <a href={`/sites/${found.id}/forms`} className="text-sm font-medium text-primary">
            {t("forms.title")}
          </a>
          <a href={`/sites/${found.id}/analytics`} className="text-sm font-medium text-primary">
            {t("analytics.title")}
          </a>
          {pendingSnapshot &&
          canPublish &&
          !found.currentSnapshotId &&
          found.status === "preview" ? (
            <form action={approveSiteAction}>
              <input type="hidden" name="siteId" value={found.id} />
              <input type="hidden" name="accountId" value={found.accountId} />
              <input type="hidden" name="snapshotId" value={pendingSnapshot.id} />
              <Button type="submit">{t("sites.goLive")}</Button>
            </form>
          ) : null}
          {canEdit && found.draftSnapshotId ? (
            <form action={undoEditAction}>
              <input type="hidden" name="siteId" value={found.id} />
              <input type="hidden" name="accountId" value={found.accountId} />
              <Button type="submit" variant="outline">
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
        </div>
      </div>
      <div className="builder-grid grid min-h-0 flex-1">
        <section className="flex min-h-0 flex-col border-border md:border-r">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {query.error ? <Alert variant="destructive">{t("sites.failed")}</Alert> : null}
            {importing ? (
              <>
                <Thinking label={t("sites.importing")} />
                <Steps
                  items={[
                    {
                      id: "found",
                      label: `${t("sites.pagesFound")} ${progress.pagesFound ?? 0}`,
                      state: (progress.pagesDone ?? 0) > 0 ? "done" : "active"
                    },
                    {
                      id: "done",
                      label: `${t("sites.pagesDone")} ${progress.pagesDone ?? 0}`,
                      state: "active"
                    },
                    ...(progress.skipped ?? []).map((item) => ({
                      id: item.path,
                      label: `${t("sites.skipped")} ${item.path}: ${item.reason}`,
                      state: "wait" as const
                    }))
                  ]}
                />
              </>
            ) : null}
            {found.status === "failed" ? (
              <Alert variant="destructive">{latest?.error ?? t("sites.failed")}</Alert>
            ) : null}
            {found.status === "live" ? (
              <p
                role="status"
                className="rounded-md border border-[var(--brand-signal)]/30 bg-[var(--done-wash)] px-4 py-3 text-sm"
              >
                {t("sites.live")}
              </p>
            ) : null}
            {working ? (
              <>
                <Thinking label={t("chat.working")} />
                <Steps items={[{ id: "draft", label: "Updating the draft", state: "active" }]} />
              </>
            ) : null}
            {messages.some((item) => item.body === "Someone else is editing this site.") ? (
              <Alert variant="warning">{t("chat.locked")}</Alert>
            ) : null}
            <div>
              {messages.map((item) => {
                const you = item.author === "user";
                return (
                  <div key={item.id} className={you ? "mb-4 flex justify-end" : "mb-4 flex gap-3"}>
                    {you ? null : (
                      <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-[#14161a]">
                        <FlagstageMark className="size-7" />
                      </span>
                    )}
                    <p
                      className={
                        you
                          ? "max-w-[85%] rounded-2xl bg-[var(--you)] px-3 py-2 text-sm whitespace-pre-wrap"
                          : "max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
                      }
                    >
                      {chatBody(item.body)}
                    </p>
                  </div>
                );
              })}
            </div>
            {report ? (
              <section>
                <h2 className="mb-2 text-sm font-semibold">{t("sites.fidelity")}</h2>
                <ul className="space-y-1 text-sm text-muted-foreground">
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
              </section>
            ) : null}
            <section>
              <h2 className="mb-2 text-sm font-semibold">{t("versions.title")}</h2>
              {snaps.length === 0 ? (
                <EmptyState
                  title={t("versions.emptyTitle")}
                  description={t("versions.emptyBody")}
                  action={
                    <a href="#composer" className="text-sm font-medium text-primary">
                      {t("versions.emptyAction")}
                    </a>
                  }
                />
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                  {snaps.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="font-medium">
                        {versionLabel(item.kind, item.id, found.currentSnapshotId)}
                      </span>
                      <span className="text-muted-foreground">{friendlyWhen(item.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {canPublish && snaps.length > 1 ? (
                <form action={rollbackAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="siteId" value={found.id} />
                  <input type="hidden" name="accountId" value={found.accountId} />
                  <div className="space-y-2">
                    <Label htmlFor="snapshotId">{t("chat.rollback")}</Label>
                    <select id="snapshotId" name="snapshotId" className={fieldClass}>
                      {snaps
                        .filter((item) => item.id !== found.currentSnapshotId)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {versionLabel(item.kind, item.id, found.currentSnapshotId)}{" "}
                            {friendlyWhen(item.createdAt)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <Button type="submit" variant="outline">
                    {t("chat.rollback")}
                  </Button>
                </form>
              ) : null}
            </section>
          </div>
          <div className="border-t border-border p-3">
            {draftId ? (
              <a
                className="preview-link mb-3 text-sm font-medium text-primary"
                href={`/sites/${found.id}/live`}
              >
                {t("chat.preview")}
              </a>
            ) : null}
            {can(principal, "site.comment", { accountId: found.accountId }) ? (
              <form
                id="composer"
                action={sendMessageAction}
                className="rounded-[18px] border border-[#dcdde1] bg-background px-4 pt-3.5 pb-2.5 shadow-[0_1px_2px_rgba(16,18,24,0.04),0_8px_24px_rgba(16,18,24,0.06)]"
              >
                <input type="hidden" name="siteId" value={found.id} />
                <input type="hidden" name="accountId" value={found.accountId} />
                <label className="sr-only" htmlFor="body">
                  {t("chat.placeholder")}
                </label>
                <Textarea
                  id="body"
                  name="body"
                  required
                  rows={3}
                  placeholder={t("chat.placeholder")}
                  className="min-h-14 resize-none border-0 p-0 shadow-none focus-visible:ring-0"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    type="submit"
                    size="icon"
                    aria-label={t("chat.send")}
                    className="rounded-full bg-[#14161a] text-white hover:bg-[#14161a]/90"
                  >
                    <span aria-hidden>↑</span>
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </section>
        <BrowserFrame
          url={host}
          title={t("chat.preview")}
          src={draftId ? `/sites/${found.id}/live?v=${draftId}` : undefined}
        />
      </div>
    </div>
  );
}
