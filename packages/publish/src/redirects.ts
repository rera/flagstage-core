import { eq } from "drizzle-orm";

import type { Config } from "@flagstage/config";
import type { Database } from "@flagstage/db";
import { siteDomain, siteRedirect } from "@flagstage/db";
import { cloudfrontKeyValueBatch, normalizeHostname, type KeyValueBatch } from "@flagstage/domains";

/**
 * CloudFront key value store quotas. They are not adjustable.
 * A key is at most 512 bytes, a value is at most 1 KB, and one store is at most 5 MB
 * (5,242,880 bytes). A function can read one store, so redirect keys share the hostname store.
 * UpdateKeys accepts 50 keys at a time. That is a request size, not a per-site limit.
 */
export const KVS_LIMITS = {
  maxKeyBytes: 512,
  maxValueBytes: 1024,
  maxStoreBytes: 5 * 1024 * 1024
} as const;

export type RedirectLimits = {
  maxKeyBytes: number;
  maxValueBytes: number;
  maxStoreBytes: number;
};

export type RedirectStore = KeyValueBatch;

export type RedirectEdge = {
  store?: RedirectStore;
  /** Check the per-site quotas even when this process cannot reach the store. */
  enforce?: boolean;
  hostFor(slug: string): string;
};

export class RedirectMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedirectMapError";
  }
}

type RedirectRow = { fromPath: string; toPath: string };

export function redirectEdge(config: Config): RedirectEdge {
  const domain = config.NODE_ENV === "production" ? config.product?.domain : undefined;
  const store =
    config.HOSTMAP_DRIVER === "cloudfront-kvs" && config.CLOUDFRONT_KVS_ARN
      ? cloudfrontKeyValueBatch(config.CLOUDFRONT_KVS_ARN)
      : undefined;
  return {
    store,
    hostFor(slug) {
      return domain ? `${slug}.${domain}` : `${slug}.localhost`;
    }
  };
}

export function memoryRedirectStore(
  initial: Record<string, string> = {}
): RedirectStore & { entries: Map<string, string> } {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    async list() {
      return [...entries].map(([key, value]) => ({ key, value }));
    },
    async size() {
      let total = 0;
      for (const [key, value] of entries) {
        total += Buffer.byteLength(key) + Buffer.byteLength(value);
      }
      return total;
    },
    async update(change) {
      for (const key of change.deletes) entries.delete(key);
      for (const put of change.puts) entries.set(put.key, put.value);
    }
  };
}

function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Sorted, encoded query string. `b=1&a=2` and `a=2&b=1` are the same key. */
export function canonicalQuery(raw: string): string {
  if (!raw) return "";
  const pairs: Array<[string, string]> = [];
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eqAt = part.indexOf("=");
    const name = eqAt === -1 ? part : part.slice(0, eqAt);
    const value = eqAt === -1 ? "" : part.slice(eqAt + 1);
    pairs.push([decodeComponent(name), decodeComponent(value)]);
  }
  pairs.sort((left, right) => {
    if (left[0] < right[0]) return -1;
    if (left[0] > right[0]) return 1;
    if (left[1] < right[1]) return -1;
    if (left[1] > right[1]) return 1;
    return 0;
  });
  return pairs
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
}

/** Path plus a canonical query, always starting with `/`. */
export function canonicalFromPath(fromPath: string): string {
  const trimmed = fromPath.trim();
  const hash = trimmed.indexOf("#");
  const withoutHash = hash === -1 ? trimmed : trimmed.slice(0, hash);
  const queryAt = withoutHash.indexOf("?");
  const rawPath = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const rawQuery = queryAt === -1 ? "" : withoutHash.slice(queryAt + 1);
  const path = decodeComponent(rawPath);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const query = canonicalQuery(rawQuery);
  return query ? `${normalized}?${query}` : normalized;
}

export function redirectKey(host: string, fromPath: string): string {
  return `${normalizeHostname(host)}${canonicalFromPath(fromPath)}`;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value);
}

function show(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

export function planRedirectKeys(
  hosts: string[],
  redirects: RedirectRow[],
  limits: RedirectLimits = KVS_LIMITS
): Map<string, string> {
  const desired = new Map<string, string>();
  for (const host of hosts) {
    for (const redirect of redirects) {
      if (!redirect.toPath) {
        throw new RedirectMapError(
          `Publish stopped. The redirect from ${show(redirect.fromPath)} has no target.`
        );
      }
      const key = redirectKey(host, redirect.fromPath);
      const keyBytes = byteLength(key);
      if (keyBytes > limits.maxKeyBytes) {
        throw new RedirectMapError(
          `Publish stopped. The redirect key "${show(key)}" is ${keyBytes} bytes. A CloudFront key value store key can be at most ${limits.maxKeyBytes} bytes.`
        );
      }
      const valueBytes = byteLength(redirect.toPath);
      if (valueBytes > limits.maxValueBytes) {
        throw new RedirectMapError(
          `Publish stopped. The redirect for ${show(redirect.fromPath)} is ${valueBytes} bytes. A CloudFront key value store value can be at most ${limits.maxValueBytes} bytes (1 KB).`
        );
      }
      const previous = desired.get(key);
      if (previous !== undefined && previous !== redirect.toPath) {
        throw new RedirectMapError(
          `Publish stopped. Two redirects for ${host} both match ${show(canonicalFromPath(redirect.fromPath))} and point at different targets.`
        );
      }
      desired.set(key, redirect.toPath);
    }
  }
  let total = 0;
  for (const [key, value] of desired) total += byteLength(key) + byteLength(value);
  if (total > limits.maxStoreBytes) {
    throw new RedirectMapError(
      `Publish stopped. This site's redirects use ${total} bytes. A CloudFront key value store can hold ${limits.maxStoreBytes} bytes (5 MB), shared with every site's hostname keys.`
    );
  }
  return desired;
}

async function siteHosts(db: Database, siteId: string, host: string): Promise<string[]> {
  const domains = await db
    .select({ hostname: siteDomain.hostname })
    .from(siteDomain)
    .where(eq(siteDomain.siteId, siteId));
  const names = new Set<string>();
  for (const name of [host, ...domains.map((row) => row.hostname)]) {
    const normalized = normalizeHostname(name);
    if (normalized) names.add(normalized);
  }
  return [...names];
}

async function siteRedirects(db: Database, siteId: string): Promise<RedirectRow[]> {
  return db
    .select({ fromPath: siteRedirect.fromPath, toPath: siteRedirect.toPath })
    .from(siteRedirect)
    .where(eq(siteRedirect.siteId, siteId));
}

/** Check key, value, and per-site size. Does not call the store. */
export async function assertRedirectsFit(input: {
  db: Database;
  siteId: string;
  host: string;
  limits?: RedirectLimits;
}): Promise<{ hosts: string[]; desired: Map<string, string> }> {
  const hosts = await siteHosts(input.db, input.siteId, input.host);
  const redirects = await siteRedirects(input.db, input.siteId);
  return { hosts, desired: planRedirectKeys(hosts, redirects, input.limits ?? KVS_LIMITS) };
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "ServiceQuotaExceededException" || name === "QuotaExceeded";
}

/**
 * Replace one site's redirect keys and delete keys for its hostnames that are no longer stored.
 * Hostname prefix keys have no slash and are left in place.
 * Throws RedirectMapError before writing when the site does not fit.
 */
export async function publishRedirects(input: {
  db: Database;
  siteId: string;
  host: string;
  store: RedirectStore;
  limits?: RedirectLimits;
}): Promise<void> {
  const limits = input.limits ?? KVS_LIMITS;
  const { hosts, desired } = await assertRedirectsFit({ ...input, limits });
  const current = await input.store.list();
  const owned = current.filter((entry) => hosts.some((host) => entry.key.startsWith(`${host}/`)));
  const currentBytes = await input.store.size();
  const ownedBytes = owned.reduce(
    (total, entry) => total + byteLength(entry.key) + byteLength(entry.value),
    0
  );
  let desiredBytes = 0;
  for (const [key, value] of desired) desiredBytes += byteLength(key) + byteLength(value);
  const projected = Math.max(0, currentBytes - ownedBytes) + desiredBytes;
  if (projected > limits.maxStoreBytes) {
    throw new RedirectMapError(
      `Publish stopped. Writing this site's redirects would make the CloudFront key value store ${projected} bytes. The store can hold ${limits.maxStoreBytes} bytes (5 MB).`
    );
  }
  const currentMap = new Map(owned.map((entry) => [entry.key, entry.value]));
  const puts = [...desired]
    .filter(([key, value]) => currentMap.get(key) !== value)
    .map(([key, value]) => ({ key, value }));
  const deletes = owned.filter((entry) => !desired.has(entry.key)).map((entry) => entry.key);
  if (puts.length === 0 && deletes.length === 0) return;
  try {
    await input.store.update({ puts, deletes });
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    throw new RedirectMapError(
      "Publish stopped. The CloudFront key value store rejected the write because it would exceed its 5 MB limit."
    );
  }
}
