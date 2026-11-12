// Ported from rera/flagstage infrastructure/026-custom-domains/template.yaml viewer-request @ 27a19bd0c040d40ce2356d6758bb7127657ab782

export type ResolveResult = { ok: true; key: string } | { ok: false; status: 404 };

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
