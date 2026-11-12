// Ported from rera/flagstage infrastructure/026-custom-domains/template.yaml @ 27a19bd0c040d40ce2356d6758bb7127657ab782
var CONTENT_TYPES = {
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

function snapshotRelative(uri) {
  var marker = "/snapshots/";
  var at = uri.indexOf(marker);
  if (at === -1) {
    return "";
  }
  var rest = uri.substring(at + marker.length);
  var slash = rest.indexOf("/");
  if (slash === -1) {
    return "";
  }
  return rest.substring(slash + 1);
}

function contentType(filename) {
  var slash = filename.lastIndexOf("/");
  var base = slash === -1 ? filename : filename.substring(slash + 1);
  var dot = base.lastIndexOf(".");
  var ext = dot === -1 ? "" : base.substring(dot + 1).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

function cacheControl(filename) {
  var lower = filename.toLowerCase();
  if (lower.substring(lower.length - 5) === ".html") {
    return "no-cache";
  }
  if (lower.indexOf("assets/") === 0) {
    return "public, max-age=31536000, immutable";
  }
  if (/\.(css|js|mjs|map|png|jpe?g|gif|webp|svg|avif|ico|woff2?|ttf|eot|pdf|xml|json|txt)$/i.test(lower)) {
    return "public, max-age=86400";
  }
  return "no-store";
}

function handler(event) {
  var response = event.response;
  if (!response || (response.statusCode !== 200 && response.statusCode !== 206 && response.statusCode !== 304)) {
    return response;
  }
  var request = event.request || {};
  var relative = snapshotRelative(request.uri || "");
  if (!relative) {
    return response;
  }
  if (!response.headers) {
    response.headers = {};
  }
  response.headers["content-type"] = { value: contentType(relative) };
  response.headers["cache-control"] = { value: cacheControl(relative) };
  return response;
}
