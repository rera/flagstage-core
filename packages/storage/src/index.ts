export { cacheControlForKey, contentTypeForKey } from "./content-type";
export { FsBlobStore } from "./fs-store";
export { importPrefix, mediaPrefix, snapshotPrefix } from "./paths";
export { resolveRequestPath } from "./resolve";
export type { ResolveResult } from "./resolve";
export { S3BlobStore } from "./s3-store";
export type { BlobStore, StorageDriver, StoredObject } from "./types";

import type { Config } from "@flagstage/config";
import { S3Client } from "@aws-sdk/client-s3";

import { FsBlobStore } from "./fs-store";
import { S3BlobStore } from "./s3-store";
import type { BlobStore } from "./types";

export function createBlobStore(
  config: Pick<
    Config,
    | "STORAGE_DRIVER"
    | "FS_STORAGE_DIR"
    | "S3_BUCKET"
    | "S3_REGION"
    | "S3_ENDPOINT"
    | "S3_FORCE_PATH_STYLE"
  >
): BlobStore {
  if (config.STORAGE_DRIVER === "fs") {
    return new FsBlobStore(config.FS_STORAGE_DIR);
  }
  if (!config.S3_BUCKET || !config.S3_REGION) {
    throw new Error("S3 storage requires S3_BUCKET and S3_REGION");
  }
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE
  });
  return new S3BlobStore(client, config.S3_BUCKET);
}
