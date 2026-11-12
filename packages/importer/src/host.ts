export function slugFromHost(host: string, baseDomain: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes(".")) return null;
  return slug;
}

export function previewFromHost(
  host: string,
  baseDomain: string
): { slug: string; token: string } | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  const split = label.lastIndexOf("--");
  if (split <= 0) return null;
  const slug = label.slice(0, split);
  const token = label.slice(split + 2);
  if (!slug || !token || slug.includes(".")) return null;
  return { slug, token };
}
