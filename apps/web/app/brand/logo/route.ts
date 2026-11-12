import { loadConfig } from "@flagstage/config";
import { createBlobStore } from "@flagstage/storage";

export async function GET() {
  const object = await createBlobStore(loadConfig()).get("brand/logo");
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(object.body), {
    headers: {
      "content-type": object.contentType,
      "cache-control": "private, max-age=60"
    }
  });
}
