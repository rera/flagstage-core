// Ported from rera/flagstage infrastructure/026-custom-domains/template.yaml viewer-request @ 27a19bd0c040d40ce2356d6758bb7127657ab782

import { manifestKey, outputPrefix } from "./paths";
import type { BlobStore } from "./types";

export type ResolveResult = { ok: true; key: string } | { ok: false; status: 404 };

/**
 * Prefix visitors and preview should read.
 * A snapshot that has been built serves `out/`. An older snapshot, with files
 * at the prefix root and no manifest, keeps serving that root.
 */
export async function publicPrefixFor(store: BlobStore, storagePrefix: string): Promise<string> {
  const normalized = storagePrefix.endsWith("/") ? storagePrefix : `${storagePrefix}/`;
  const marker = await store.get(manifestKey(normalized));
  if (marker) return outputPrefix(normalized);
  return normalized;
}

/**
 * Same path rules as the CloudFront viewer-request function:
 * host map prefix + URI, directory index, reject dot segments.
 */
export function resolveRequestPath(prefix: string, rawUri: string): ResolveResult {
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  let uri = rawUri;
  try {
    uri = decodeURIComponent(uri);
  } catch {
    return { ok: false, status: 404 };
  }
  if (uri.includes("\\")) return { ok: false, status: 404 };
  const parts = uri.split("/");
  if (parts.some((part) => part === "." || part === "..")) return { ok: false, status: 404 };
  if (uri === "/" || uri === "") return { ok: true, key: `${normalized}index.html` };
  if (uri.startsWith("/")) uri = uri.slice(1);
  if (uri.endsWith("/")) return { ok: true, key: `${normalized}${uri}index.html` };
  const lastSlash = uri.lastIndexOf("/");
  const lastSeg = lastSlash === -1 ? uri : uri.slice(lastSlash + 1);
  if (!lastSeg.includes(".")) return { ok: true, key: `${normalized}${uri}/index.html` };
  return { ok: true, key: `${normalized}${uri}` };
}
