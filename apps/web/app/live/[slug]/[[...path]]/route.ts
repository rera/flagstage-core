import { and, eq } from "drizzle-orm";

import { loadConfig } from "@flagstage/config";
import { site, siteRedirect, snapshot } from "@flagstage/db";
import { createBlobStore, resolveRequestPath } from "@flagstage/storage";

import { database } from "../../../../src/guard";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; path?: string[] }> }
) {
  const { slug } = await context.params;
  const db = database();
  const rows = await db.select().from(site).where(eq(site.slug, slug)).limit(1);
  const found = rows[0];
  if (!found?.currentSnapshotId) return new Response("Not found", { status: 404 });
  const snaps = await db
    .select()
    .from(snapshot)
    .where(eq(snapshot.id, found.currentSnapshotId))
    .limit(1);
  const prefix = snaps[0]?.storagePrefix;
  if (!prefix) return new Response("Not found", { status: 404 });
  const original = request.headers.get("x-flagstage-path") ?? new URL(request.url).pathname;
  const [pathOnly, search] = original.split("?");
  const lookup = search ? `${pathOnly}?${search}` : pathOnly || "/";
  const redirects = await db
    .select()
    .from(siteRedirect)
    .where(and(eq(siteRedirect.siteId, found.id), eq(siteRedirect.fromPath, lookup)));
  const redirect = redirects[0];
  if (redirect) {
    return new Response(null, { status: redirect.code, headers: { location: redirect.toPath } });
  }
  const resolved = resolveRequestPath(prefix, pathOnly || "/");
  if (!resolved.ok) return new Response("Not found", { status: 404 });
  const object = await createBlobStore(loadConfig()).get(resolved.key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(object.body), {
    headers: { "content-type": object.contentType }
  });
}
