import { randomUUID } from "node:crypto";

import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";

import { diffManifests } from "@flagstage/sitebuild";
import { publicPrefixFor, type BlobStore } from "@flagstage/storage";

import { readManifest } from "./materialize";

const BATCH = 3000;

/**
 * Changed files above this count invalidate the whole distribution.
 * Per-file paths multiply (visitor path plus the rewritten snapshot key) and
 * CloudFront caps one invalidation at 3000 paths.
 */
export const INVALIDATION_FILE_LIMIT = 500;

export type InvalidationSend = (input: {
  distributionId: string;
  paths: string[];
}) => Promise<void>;

/**
 * Paths CloudFront should drop for these output keys.
 * More than INVALIDATION_FILE_LIMIT files become one `/*` path.
 * Below that, the viewer-request function rewrites the URI to the snapshot
 * prefix before the cache lookup, so the rewritten key is included. The
 * visitor path is included as well, for a cache that still keys on the
 * original URI.
 */
export function invalidationPaths(publicPrefix: string, keys: string[]): string[] {
  const files = [...new Set(keys.filter((key) => key && !key.startsWith("/")))];
  if (files.length > INVALIDATION_FILE_LIMIT) return ["/*"];
  const prefix = publicPrefix.startsWith("/") ? publicPrefix : `/${publicPrefix}`;
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const paths = new Set<string>();
  for (const key of files) {
    paths.add(`${normalized}${key}`);
    if (key === "index.html") {
      paths.add("/");
      paths.add("/index.html");
      continue;
    }
    if (key.endsWith("/index.html")) {
      const dir = `/${key.slice(0, -"index.html".length)}`;
      paths.add(dir);
      paths.add(dir.slice(0, -1));
      paths.add(`/${key}`);
      continue;
    }
    paths.add(`/${key}`);
  }
  return [...paths].sort();
}

export async function invalidateDistribution(input: {
  distributionId?: string;
  paths: string[];
  send?: InvalidationSend;
}): Promise<void> {
  const distributionId = input.distributionId?.trim();
  const paths = [...new Set(input.paths)].filter((path) => path.startsWith("/")).sort();
  if (!distributionId || paths.length === 0) return;
  for (let index = 0; index < paths.length; index += BATCH) {
    const batch = paths.slice(index, index + BATCH);
    if (input.send) {
      await input.send({ distributionId, paths: batch });
      continue;
    }
    const client = new CloudFrontClient({ region: "us-east-1" });
    await client.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `${randomUUID()}-${index}`,
          Paths: { Quantity: batch.length, Items: batch }
        }
      })
    );
  }
}

/**
 * Invalidate keys that differ between two snapshots. Unchanged keys are omitted.
 * `toPrefix` is the snapshot now being served. Removed keys are included so a
 * deleted page does not stay cached.
 */
export async function invalidatePublishedKeys(input: {
  store: BlobStore;
  distributionId?: string;
  fromPrefix?: string | null;
  toPrefix: string;
  send?: InvalidationSend;
}): Promise<void> {
  const next = await readManifest(input.store, input.toPrefix);
  const previous = input.fromPrefix ? await readManifest(input.store, input.fromPrefix) : null;
  const publicPrefix = await publicPrefixFor(input.store, input.toPrefix);
  const diff = next
    ? diffManifests(previous ?? { files: {} }, next)
    : { changed: await keysUnder(input.store, publicPrefix), removed: [], unchanged: [] };
  const keys = [...diff.changed, ...diff.removed];
  await invalidateDistribution({
    distributionId: input.distributionId,
    paths: invalidationPaths(publicPrefix, keys),
    send: input.send
  });
}

async function keysUnder(store: BlobStore, prefix: string): Promise<string[]> {
  const root = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const listed = await store.list(root);
  return listed
    .map((item) => item.key.slice(root.length))
    .filter(
      (key) =>
        key.length > 0 &&
        !key.endsWith("/") &&
        !key.startsWith("src/") &&
        !key.startsWith("out/") &&
        !key.startsWith(".flagstage/")
    );
}
