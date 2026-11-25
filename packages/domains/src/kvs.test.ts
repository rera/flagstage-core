import {
  DescribeKeyValueStoreCommand,
  ListKeysCommand,
  UpdateKeysCommand
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import { describe, expect, it } from "vitest";

import { KEY_VALUE_UPDATE_BATCH, cloudfrontKeyValueBatch } from "./kvs";

describe("cloudfront key value batch", () => {
  it("pages the list and updates at most 50 keys at a time", async () => {
    const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
    let etag = "e1";
    const client = {
      async send(command: unknown) {
        const named = command as { constructor: { name: string }; input: Record<string, unknown> };
        calls.push({ name: named.constructor.name, input: named.input });
        if (command instanceof DescribeKeyValueStoreCommand) {
          return { ETag: etag, TotalSizeInBytes: 12 };
        }
        if (command instanceof ListKeysCommand) {
          if (!named.input.NextToken) {
            return { Items: [{ Key: "a", Value: "1" }], NextToken: "next" };
          }
          return { Items: [{ Key: "b", Value: "2" }] };
        }
        if (command instanceof UpdateKeysCommand) {
          const puts = (named.input.Puts as unknown[] | undefined)?.length ?? 0;
          const deletes = (named.input.Deletes as unknown[] | undefined)?.length ?? 0;
          expect(puts + deletes).toBeLessThanOrEqual(KEY_VALUE_UPDATE_BATCH);
          expect(puts + deletes).toBeGreaterThan(0);
          expect(named.input.IfMatch).toBe(etag);
          etag = `${etag}x`;
          return { ETag: etag };
        }
        throw new Error(named.constructor.name);
      }
    };
    const batch = cloudfrontKeyValueBatch("arn:test", client);
    expect(await batch.size()).toBe(12);
    expect(await batch.list()).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" }
    ]);
    await batch.update({
      puts: Array.from({ length: 51 }, (_, index) => ({ key: `k${index}`, value: "v" })),
      deletes: ["gone"]
    });
    const updates = calls.filter((call) => call.name === "UpdateKeysCommand");
    expect(updates.map((call) => call.input.Deletes)).toEqual([
      [{ Key: "gone" }],
      undefined,
      undefined
    ]);
    expect((updates[1]?.input.Puts as unknown[]).length).toBe(50);
    expect((updates[2]?.input.Puts as unknown[]).length).toBe(1);
    expect(updates[1]?.input.IfMatch).toBe("e1x");
  });
});
