import { eq } from "drizzle-orm";

import { loadConfig } from "@flagstage/config";
import { can, loadGrants } from "@flagstage/core";
import { site, snapshot } from "@flagstage/db";
import { createBlobStore, resolveRequestPath } from "@flagstage/storage";

import { currentSession } from "../../../../../src/auth";
import { database } from "../../../../../src/guard";

export async function GET(
  _request: Request,
  context: { params: Promise<{ siteId: string; path?: string[] }> }
) {
  const { siteId, path } = await context.params;
  const authSession = await currentSession();
  if (!authSession?.user) {
    return Response.redirect(new URL("/sign-in", loadConfig().APP_URL));
  }
  const db = database();
  const sites = await db.select().from(site).where(eq(site.id, siteId)).limit(1);
  const found = sites[0];
  if (!found) return new Response("Not found", { status: 404 });
  const grants = await loadGrants(db, authSession.user.id);
  const allowed = can(
    {
      id: authSession.user.id,
      orgRole: grants.orgRole,
      disabled: grants.disabled,
      memberships: grants.memberships
    },
    "site.read",
    { accountId: found.accountId }
  );
  if (!allowed) return new Response("Not found", { status: 404 });
  const snapshotId = found.draftSnapshotId ?? found.currentSnapshotId;
  if (!snapshotId) return new Response("Not found", { status: 404 });
  const snaps = await db.select().from(snapshot).where(eq(snapshot.id, snapshotId)).limit(1);
  const prefix = snaps[0]?.storagePrefix;
  if (!prefix) return new Response("Not found", { status: 404 });
  const requestPath = path && path.length > 0 ? `/${path.join("/")}` : "/";
  const resolved = resolveRequestPath(prefix, requestPath);
  if (!resolved.ok) return new Response("Not found", { status: 404 });
  const object = await createBlobStore(loadConfig()).get(resolved.key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(object.body), {
    headers: { "content-type": object.contentType, "cache-control": "no-store" }
  });
}
