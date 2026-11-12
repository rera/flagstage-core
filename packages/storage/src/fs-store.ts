import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { contentTypeForKey } from "./content-type";
import { assertSafeKey } from "./paths";
import type { BlobStore, StoredObject } from "./types";

type Meta = Record<string, string>;

export class FsBlobStore implements BlobStore {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    const safe = assertSafeKey(key);
    const full = resolve(this.root, safe);
    const root = resolve(this.root);
    if (full !== root && !full.startsWith(`${root}/`)) {
      throw new Error("Unsafe storage key");
    }
    return full;
  }

  private async readMeta(): Promise<Meta> {
    try {
      const raw = await readFile(join(this.root, "_meta.json"), "utf8");
      return JSON.parse(raw) as Meta;
    } catch {
      return {};
    }
  }

  private async writeMeta(meta: Meta): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, "_meta.json"), JSON.stringify(meta));
  }

  async put(key: string, body: Uint8Array, contentType?: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    const meta = await this.readMeta();
    meta[key] = contentType ?? contentTypeForKey(key);
    await this.writeMeta(meta);
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const body = await readFile(this.pathFor(key));
      const meta = await this.readMeta();
      return { body, contentType: meta[key] ?? contentTypeForKey(key) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async list(prefix: string): Promise<Array<{ key: string; size: number }>> {
    const out: Array<{ key: string; size: number }> = [];
    async function walk(dir: string, root: string) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        if (entry.name === "_meta.json") continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, root);
          continue;
        }
        const key = relative(root, full).split("\\").join("/");
        if (!key.startsWith(prefix)) continue;
        const info = await stat(full);
        out.push({ key, size: info.size });
      }
    }
    await walk(resolve(this.root), resolve(this.root));
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
    const meta = await this.readMeta();
    delete meta[key];
    await this.writeMeta(meta);
  }
}
