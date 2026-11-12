import { createHmac } from "node:crypto";

const SCRIPT = /<script defer src="[^"]*\/a\.js"[^>]*><\/script>/g;

export function visitorHash(secret: string, day: string, ip: string, userAgent: string): string {
  return createHmac("sha256", secret).update(`${day}\n${ip}\n${userAgent}`).digest("hex");
}

export function analyticsTag(appOrigin: string, siteId: string): string {
  return `<script defer src="${appOrigin}/a.js" data-site="${siteId}"></script>`;
}

export function injectAnalytics(
  html: string,
  appOrigin: string,
  siteId: string,
  enabled: boolean
): string {
  const stripped = html.replace(SCRIPT, "");
  if (!enabled) return stripped;
  const tag = analyticsTag(appOrigin, siteId);
  if (stripped.includes(tag)) return stripped;
  return stripped.includes("</body>")
    ? stripped.replace("</body>", `${tag}</body>`)
    : `${stripped}${tag}`;
}

export function beaconSource(appOrigin: string): string {
  const endpoint = JSON.stringify(`${appOrigin}/a/collect`);
  return `!function(){var s=document.currentScript;if(!s)return;var id=s.dataset.site;if(!id)return;var body=JSON.stringify({site:id,path:location.pathname,referrer:document.referrer||""});navigator.sendBeacon(${endpoint},new Blob([body],{type:"application/json"}))}();`;
}

export type Visit = {
  siteId: string;
  path: string;
  referrer: string | null;
  visitorHash: string;
  createdAt: Date;
};

export type DailyRow = {
  siteId: string;
  day: string;
  path: string;
  pageviews: number;
  visitors: number;
  topReferrers: Array<{ referrer: string; count: number }>;
};

export function rollupVisits(events: Visit[]): DailyRow[] {
  const groups = new Map<
    string,
    {
      siteId: string;
      day: string;
      path: string;
      pageviews: number;
      visitors: Set<string>;
      referrers: Map<string, number>;
    }
  >();
  for (const event of events) {
    const day = event.createdAt.toISOString().slice(0, 10);
    const key = `${event.siteId}\0${day}\0${event.path}`;
    const group = groups.get(key) ?? {
      siteId: event.siteId,
      day,
      path: event.path,
      pageviews: 0,
      visitors: new Set<string>(),
      referrers: new Map<string, number>()
    };
    group.pageviews += 1;
    group.visitors.add(event.visitorHash);
    if (event.referrer)
      group.referrers.set(event.referrer, (group.referrers.get(event.referrer) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    siteId: group.siteId,
    day: group.day,
    path: group.path,
    pageviews: group.pageviews,
    visitors: group.visitors.size,
    topReferrers: [...group.referrers.entries()]
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }));
}

export const RAW_EVENT_RETENTION_MS = 48 * 60 * 60 * 1000;

export function expiredEventIds(
  events: Array<{ id: string; createdAt: Date }>,
  now: Date
): string[] {
  return events
    .filter((event) => now.getTime() - event.createdAt.getTime() > RAW_EVENT_RETENTION_MS)
    .map((event) => event.id);
}
