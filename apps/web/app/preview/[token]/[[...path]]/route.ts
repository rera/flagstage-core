import { eq } from "drizzle-orm";

import { previewForToken } from "@flagstage/agent";
import { loadConfig } from "@flagstage/config";
import { snapshot } from "@flagstage/db";
import { createBlobStore, resolveRequestPath } from "@flagstage/storage";

import { database } from "../../../../src/guard";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; path?: string[] }> }
) {
  const { token, path } = await context.params;
  const session = await previewForToken(database(), token);
  if (!session) return new Response("This preview has expired.", { status: 404 });
  const snaps = await database()
    .select()
    .from(snapshot)
    .where(eq(snapshot.id, session.snapshotId))
    .limit(1);
  const prefix = snaps[0]?.storagePrefix;
  if (!prefix) return new Response("Not found", { status: 404 });
  const requestPath = path && path.length > 0 ? `/${path.join("/")}` : "/";
  const resolved = resolveRequestPath(prefix, requestPath);
  if (!resolved.ok) return new Response("Not found", { status: 404 });
  const object = await createBlobStore(loadConfig()).get(resolved.key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(object.body), {
    headers: {
      "content-type": object.contentType,
      "set-cookie": `flagstage_preview=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`
    }
  });
}
