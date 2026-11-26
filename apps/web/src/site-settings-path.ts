export function settingsTabPath(
  accountSlug: string,
  siteId: string,
  tab: "people" | "skills" | "domain",
  query: Record<string, string | string[] | undefined> = {}
) {
  const url = new URL(`/a/${accountSlug}/sites/${siteId}/settings/${tab}`, "http://local");
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") url.searchParams.set(key, value);
    else if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, item);
  }
  return `${url.pathname}${url.search}`;
}
