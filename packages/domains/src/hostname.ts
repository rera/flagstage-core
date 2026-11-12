// Ported from rera/flagstage packages/sites/src/domains/hostname.ts @ 27a19bd0c040d40ce2356d6758bb7127657ab782

const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeHostname(raw: string): string {
  const withoutScheme = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/\.$/, "");
  const host = withoutScheme.split("/")[0] ?? "";
  return host.split(":")[0] ?? "";
}

export function isValidHostname(hostname: string): boolean {
  if (hostname.length < 3 || hostname.length > 253) return false;
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length < 2) return false;
  return labels.every((label) => HOSTNAME_LABEL.test(label));
}

/** Two labels, such as example.com. Multi-part public suffixes are out of scope. */
export function isApexHostname(hostname: string): boolean {
  return hostname.split(".").filter(Boolean).length === 2;
}
