#!/usr/bin/env node
// Dev-only static server for published sites. Reads hostmap.json and serves
// the snapshot files. AWS serves those files from S3 through CloudFront.
// The app does not serve live HTML.

import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.env.FS_STORAGE_DIR ?? ".data/storage");
const port = Number(process.env.DEV_SITES_PORT ?? 8088);
const mapPath = join(root, "hostmap.json");

const types = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff2: "font/woff2",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8"
};

function keyFor(prefix, rawUri) {
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  let uri = rawUri;
  try {
    uri = decodeURIComponent(uri);
  } catch {
    return null;
  }
  if (uri.includes("\\")) return null;
  if (uri.split("/").some((part) => part === "." || part === "..")) return null;
  if (uri === "/" || uri === "") return `${normalized}index.html`;
  if (uri.startsWith("/")) uri = uri.slice(1);
  if (uri.endsWith("/")) return `${normalized}${uri}index.html`;
  const last = uri.slice(uri.lastIndexOf("/") + 1);
  if (!last.includes(".")) return `${normalized}${uri}/index.html`;
  return `${normalized}${uri}`;
}

function contentType(key) {
  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  return types[ext] ?? "application/octet-stream";
}

const server = createServer((request, response) => {
  let map = {};
  try {
    map = JSON.parse(readFileSync(mapPath, "utf8"));
  } catch {
    map = {};
  }
  const host = String(request.headers.host ?? "")
    .split(":")[0]
    .toLowerCase();
  const prefix = map[host];
  if (!prefix) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("No published site for this host.");
    return;
  }
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const key = keyFor(prefix, pathname);
  if (!key) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const file = resolve(root, key);
  if (file !== root && !file.startsWith(`${root}/`)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  if (!existsSync(file)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": contentType(key) });
  response.end(readFileSync(file));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`published sites on http://127.0.0.1:${port} from ${root}`);
  console.log("open http://<slug>.localhost:" + port + " after adding that name in /etc/hosts");
});
