// Ported from rera/flagstage infrastructure/026-custom-domains/template.yaml @ 27a19bd0c040d40ce2356d6758bb7127657ab782

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wasm: "application/wasm"
};

export function contentTypeForKey(key: string): string {
  const slash = key.lastIndexOf("/");
  const base = slash === -1 ? key : key.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  const ext = dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function cacheControlForKey(relative: string): string {
  const lower = relative.toLowerCase();
  if (lower.endsWith(".html")) return "no-cache";
  if (lower.startsWith("assets/")) return "public, max-age=31536000, immutable";
  if (
    /\.(css|js|mjs|map|png|jpe?g|gif|webp|svg|avif|ico|woff2?|ttf|eot|pdf|xml|json|txt)$/i.test(
      lower
    )
  ) {
    return "public, max-age=86400";
  }
  return "no-store";
}
