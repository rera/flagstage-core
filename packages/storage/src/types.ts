export type StoredObject = {
  body: Uint8Array;
  contentType: string;
};

export interface BlobStore {
  put(key: string, body: Uint8Array, contentType?: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  list(prefix: string): Promise<Array<{ key: string; size: number }>>;
  delete(key: string): Promise<void>;
}

export type StorageDriver = "fs" | "s3";
