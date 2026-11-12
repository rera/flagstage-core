export function slugFromHost(host: string, baseDomain: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes(".")) return null;
  return slug;
}
