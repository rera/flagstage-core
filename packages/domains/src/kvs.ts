import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  ListKeysCommand,
  UpdateKeysCommand
} from "@aws-sdk/client-cloudfront-keyvaluestore";

/** UpdateKeys accepts at most 50 keys in one request. */
export const KEY_VALUE_UPDATE_BATCH = 50;

export type KeyValueEntry = { key: string; value: string };

export type KeyValueBatch = {
  list(): Promise<KeyValueEntry[]>;
  size(): Promise<number>;
  update(change: { puts: KeyValueEntry[]; deletes: string[] }): Promise<void>;
};

type KvsPage = {
  ETag?: string;
  TotalSizeInBytes?: number;
  Items?: Array<{ Key?: string; Value?: string }>;
  NextToken?: string;
};

type KvsSender = {
  send(command: unknown): Promise<KvsPage>;
};

/**
 * Read and replace keys in one CloudFront key value store.
 * Deletes are sent before puts so a full store frees space first.
 * Each request stays within the 50-key UpdateKeys quota.
 */
export function cloudfrontKeyValueBatch(arn: string, client?: KvsSender): KeyValueBatch {
  const kvs: KvsSender =
    client ?? (new CloudFrontKeyValueStoreClient({ region: "us-east-1" }) as unknown as KvsSender);

  async function etag(): Promise<string> {
    const described = await kvs.send(new DescribeKeyValueStoreCommand({ KvsARN: arn }));
    if (!described.ETag) throw new Error("CloudFront key value store did not return an ETag.");
    return described.ETag;
  }

  async function write(
    match: string,
    puts: Array<{ Key: string; Value: string }>,
    deletes: Array<{ Key: string }>
  ): Promise<string> {
    const result = await kvs.send(
      new UpdateKeysCommand({
        KvsARN: arn,
        IfMatch: match,
        ...(puts.length > 0 ? { Puts: puts } : {}),
        ...(deletes.length > 0 ? { Deletes: deletes } : {})
      })
    );
    if (!result.ETag) throw new Error("CloudFront key value store did not return an ETag.");
    return result.ETag;
  }

  return {
    async list() {
      const entries: KeyValueEntry[] = [];
      let token: string | undefined;
      do {
        const page = await kvs.send(
          new ListKeysCommand({
            KvsARN: arn,
            MaxResults: KEY_VALUE_UPDATE_BATCH,
            ...(token ? { NextToken: token } : {})
          })
        );
        for (const item of page.Items ?? []) {
          if (!item.Key) continue;
          entries.push({ key: item.Key, value: item.Value ?? "" });
        }
        token = page.NextToken;
      } while (token);
      return entries;
    },
    async size() {
      const described = await kvs.send(new DescribeKeyValueStoreCommand({ KvsARN: arn }));
      return described.TotalSizeInBytes ?? 0;
    },
    async update(change) {
      const deletes = change.deletes.map((key) => ({ Key: key }));
      const puts = change.puts.map((entry) => ({ Key: entry.key, Value: entry.value }));
      if (deletes.length === 0 && puts.length === 0) return;
      let match = await etag();
      for (let index = 0; index < deletes.length; index += KEY_VALUE_UPDATE_BATCH) {
        match = await write(match, [], deletes.slice(index, index + KEY_VALUE_UPDATE_BATCH));
      }
      for (let index = 0; index < puts.length; index += KEY_VALUE_UPDATE_BATCH) {
        match = await write(match, puts.slice(index, index + KEY_VALUE_UPDATE_BATCH), []);
      }
    }
  };
}
