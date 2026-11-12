import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { loadConfig, resolveBrandLogo } from "@flagstage/config";

const types: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export async function GET() {
  const config = loadConfig();
  const logo = config.product?.brand.logo;
  const path = config.productPath && logo ? resolveBrandLogo(config.productPath, logo) : undefined;
  if (!path) return new Response("Not found", { status: 404 });
  const type = types[extname(path).toLowerCase()] ?? "application/octet-stream";
  return new Response(readFileSync(path), {
    headers: { "content-type": type, "cache-control": "private, max-age=60" }
  });
}
