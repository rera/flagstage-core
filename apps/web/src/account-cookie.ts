export const ACCOUNT_COOKIE = "fs-account";
export const SITE_COOKIE = "fs-sites";
export const SIDEBAR_COOKIE = "fs-sidebar";
/** Scratch mockups only. Unset keeps the current sidebar. */
export const IA_COOKIE = "fs-ia";

export type SidebarIa = "current" | "settings" | "setup" | "menu";

export function parseSidebarIa(value: string | undefined): SidebarIa {
  if (value === "settings" || value === "setup" || value === "menu") return value;
  return "current";
}

const SLUG = /^[a-z0-9-]+$/;
const SITE_ID = /^[A-Za-z0-9-]+$/;

export function parseSiteMemory(value: string | undefined): Map<string, string> {
  const memory = new Map<string, string>();
  if (!value) return memory;
  for (const part of value.split(",")) {
    const split = part.indexOf(":");
    if (split <= 0) continue;
    const slug = part.slice(0, split);
    const siteId = part.slice(split + 1);
    if (SLUG.test(slug) && SITE_ID.test(siteId)) memory.set(slug, siteId);
  }
  return memory;
}

export function serializeSiteMemory(memory: Map<string, string>): string {
  return [...memory.entries()].map(([slug, siteId]) => `${slug}:${siteId}`).join(",");
}
