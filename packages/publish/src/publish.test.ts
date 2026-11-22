import { describe, expect, it } from "vitest";

import {
  manifestKey,
  outputPrefix,
  sourcePrefix,
  type BlobStore,
  type StoredObject
} from "@flagstage/storage";

import { invalidatePublishedKeys, invalidationPaths } from "./invalidate";
import { materializeOutput } from "./materialize";

const text = new TextEncoder();
const decode = new TextDecoder();

function memoryStore(): BlobStore & { files: Map<string, StoredObject> } {
  const files = new Map<string, StoredObject>();
  return {
    files,
    async put(key, body, contentType) {
      files.set(key, {
        body: new Uint8Array(body),
        contentType: contentType ?? "application/octet-stream"
      });
    },
    async get(key) {
      return files.get(key) ?? null;
    },
    async list(prefix) {
      return [...files.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort()
        .map((key) => ({ key, size: files.get(key)?.body.byteLength ?? 0 }));
    },
    async delete(key) {
      files.delete(key);
    },
    async copy(from, to) {
      const object = files.get(from);
      if (!object) throw new Error(`Missing ${from}`);
      files.set(to, { body: new Uint8Array(object.body), contentType: object.contentType });
    }
  };
}

function watch(inner: BlobStore) {
  const puts: string[] = [];
  const copies: Array<{ from: string; to: string }> = [];
  const deletes: string[] = [];
  const store: BlobStore = {
    async put(key, body, contentType) {
      puts.push(key);
      await inner.put(key, body, contentType);
    },
    async get(key) {
      return inner.get(key);
    },
    async list(prefix) {
      return inner.list(prefix);
    },
    async delete(key) {
      deletes.push(key);
      await inner.delete(key);
    },
    async copy(from, to) {
      copies.push({ from, to });
      await inner.copy(from, to);
    }
  };
  return { store, puts, copies, deletes };
}

async function body(store: BlobStore, key: string): Promise<string> {
  const object = await store.get(key);
  return object ? decode.decode(object.body) : "";
}

describe("publish output", () => {
  it("copies plain HTML into out and uploads every key the first time", async () => {
    const store = memoryStore();
    const prefix = "snapshots/site/first/";
    const page = text.encode("<p>Plain</p>");
    await store.put(`${sourcePrefix(prefix)}index.html`, page, "text/html; charset=utf-8");
    await store.put(`${sourcePrefix(prefix)}assets/a.css`, text.encode("body{}"), "text/css");
    const watched = watch(store);
    const result = await materializeOutput({ store: watched.store, storagePrefix: prefix });
    expect(result.diff.changed).toEqual(["assets/a.css", "index.html"]);
    expect(result.diff.unchanged).toEqual([]);
    expect(result.diff.removed).toEqual([]);
    expect(watched.copies).toEqual([]);
    expect(watched.deletes).toEqual([]);
    expect(await body(store, `${outputPrefix(prefix)}index.html`)).toBe("<p>Plain</p>");
    const out = await store.get(`${outputPrefix(prefix)}index.html`);
    expect(out?.contentType).toContain("text/html");
    expect(Buffer.compare(out?.body ?? new Uint8Array(), page)).toBe(0);
  });

  it("stitches an include into out and does not publish the fragment", async () => {
    const store = memoryStore();
    const prefix = "snapshots/site/include/";
    await store.put(
      `${sourcePrefix(prefix)}index.html`,
      text.encode('<!--#include virtual="/_inc/header.html" -->\n<p>Body</p>')
    );
    await store.put(
      `${sourcePrefix(prefix)}_inc/header.html`,
      text.encode("<header>Park header</header>")
    );
    await materializeOutput({ store, storagePrefix: prefix });
    const page = await body(store, `${outputPrefix(prefix)}index.html`);
    expect(page).toContain("Park header");
    expect(page).toContain("<p>Body</p>");
    expect(page).not.toContain("<!--#include");
    expect(await store.get(`${outputPrefix(prefix)}_inc/header.html`)).toBeNull();
    expect(await body(store, `${sourcePrefix(prefix)}index.html`)).toContain("<!--#include");
  });

  it("puts changed keys, copies unchanged keys, and deletes removed keys", async () => {
    const store = memoryStore();
    const previous = "snapshots/site/prev/";
    const next = "snapshots/site/next/";
    await store.put(`${sourcePrefix(previous)}index.html`, text.encode("<p>v1</p>"));
    await store.put(`${sourcePrefix(previous)}about/index.html`, text.encode("<p>About</p>"));
    await store.put(`${sourcePrefix(previous)}assets/a.css`, text.encode("body{}"));
    await materializeOutput({ store, storagePrefix: previous });

    await store.put(`${sourcePrefix(next)}index.html`, text.encode("<p>v2</p>"));
    await store.put(`${sourcePrefix(next)}assets/a.css`, text.encode("body{}"));
    const watched = watch(store);
    const result = await materializeOutput({
      store: watched.store,
      storagePrefix: next,
      previousStoragePrefix: previous
    });
    expect(result.diff.changed).toEqual(["index.html"]);
    expect(result.diff.unchanged).toEqual(["assets/a.css"]);
    expect(result.diff.removed).toEqual(["about/index.html"]);
    expect(watched.puts.filter((key) => !key.endsWith("manifest.json"))).toEqual([
      `${outputPrefix(next)}index.html`
    ]);
    expect(watched.copies).toEqual([
      {
        from: `${outputPrefix(previous)}assets/a.css`,
        to: `${outputPrefix(next)}assets/a.css`
      }
    ]);
    expect(watched.deletes).toEqual([`${outputPrefix(next)}about/index.html`]);
    expect(await body(store, `${outputPrefix(next)}index.html`)).toBe("<p>v2</p>");
    expect(await body(store, `${outputPrefix(next)}assets/a.css`)).toBe("body{}");
    expect(await store.get(`${outputPrefix(next)}about/index.html`)).toBeNull();
    expect(await body(store, `${outputPrefix(previous)}about/index.html`)).toBe("<p>About</p>");
  });

  it("uploads a missing unchanged object instead of failing the copy", async () => {
    const store = memoryStore();
    const previous = "snapshots/site/gap-prev/";
    const next = "snapshots/site/gap-next/";
    await store.put(`${sourcePrefix(previous)}assets/a.css`, text.encode("body{}"));
    await materializeOutput({ store, storagePrefix: previous });
    await store.delete(`${outputPrefix(previous)}assets/a.css`);
    await store.put(`${sourcePrefix(next)}assets/a.css`, text.encode("body{}"));
    const watched = watch(store);
    await materializeOutput({
      store: watched.store,
      storagePrefix: next,
      previousStoragePrefix: previous
    });
    expect(watched.copies).toEqual([
      {
        from: `${outputPrefix(previous)}assets/a.css`,
        to: `${outputPrefix(next)}assets/a.css`
      }
    ]);
    expect(watched.puts).toContain(`${outputPrefix(next)}assets/a.css`);
    expect(await body(store, `${outputPrefix(next)}assets/a.css`)).toBe("body{}");
  });

  it("migrates a legacy snapshot once and leaves the original files in place", async () => {
    const store = memoryStore();
    const prefix = "snapshots/site/legacy/";
    await store.put(
      `${prefix}index.html`,
      text.encode("<p>Legacy</p>"),
      "text/html; charset=utf-8"
    );
    await materializeOutput({ store, storagePrefix: prefix });
    expect(await body(store, `${sourcePrefix(prefix)}index.html`)).toBe("<p>Legacy</p>");
    expect(await body(store, `${outputPrefix(prefix)}index.html`)).toBe("<p>Legacy</p>");
    expect(await body(store, `${prefix}index.html`)).toBe("<p>Legacy</p>");
    expect(await store.get(manifestKey(prefix))).toBeTruthy();

    await store.put(`${sourcePrefix(prefix)}index.html`, text.encode("<p>Edited source</p>"));
    const watched = watch(store);
    const again = await materializeOutput({
      store: watched.store,
      storagePrefix: prefix,
      previousStoragePrefix: prefix
    });
    expect(again.diff.changed).toEqual(["index.html"]);
    expect(watched.copies.some((item) => item.from === `${prefix}index.html`)).toBe(false);
    expect(await body(store, `${sourcePrefix(prefix)}index.html`)).toBe("<p>Edited source</p>");
    expect(await body(store, `${outputPrefix(prefix)}index.html`)).toBe("<p>Edited source</p>");
    expect(await body(store, `${prefix}index.html`)).toBe("<p>Legacy</p>");
  });
});

describe("CDN invalidation", () => {
  it("names changed and removed keys and skips unchanged ones", async () => {
    const store = memoryStore();
    const previous = "snapshots/site/inv-prev/";
    const next = "snapshots/site/inv-next/";
    await store.put(`${sourcePrefix(previous)}index.html`, text.encode("<p>v1</p>"));
    await store.put(`${sourcePrefix(previous)}about/index.html`, text.encode("<p>About</p>"));
    await store.put(`${sourcePrefix(previous)}assets/a.css`, text.encode("body{}"));
    await materializeOutput({ store, storagePrefix: previous });
    await store.put(`${sourcePrefix(next)}index.html`, text.encode("<p>v2</p>"));
    await store.put(`${sourcePrefix(next)}assets/a.css`, text.encode("body{}"));
    await materializeOutput({ store, storagePrefix: next, previousStoragePrefix: previous });

    const sent: string[][] = [];
    await invalidatePublishedKeys({
      store,
      distributionId: "EDIST",
      fromPrefix: previous,
      toPrefix: next,
      send: async (input) => {
        sent.push(input.paths);
      }
    });
    const paths = sent.flat();
    expect(paths.some((path) => path.endsWith("/out/index.html"))).toBe(true);
    expect(paths.some((path) => path.endsWith("/out/about/index.html"))).toBe(true);
    expect(paths.some((path) => path.includes("a.css"))).toBe(false);
    expect(paths).toContain("/");
    expect(paths).toContain("/about/");

    sent.length = 0;
    await invalidatePublishedKeys({
      store,
      fromPrefix: previous,
      toPrefix: next,
      send: async () => {
        sent.push(["called"]);
      }
    });
    expect(sent).toEqual([]);
  });

  it("builds visitor and origin paths for a key", () => {
    expect(invalidationPaths("snapshots/site/snap/out/", ["news/index.html"])).toEqual([
      "/news",
      "/news/",
      "/news/index.html",
      "/snapshots/site/snap/out/news/index.html"
    ]);
  });
});
